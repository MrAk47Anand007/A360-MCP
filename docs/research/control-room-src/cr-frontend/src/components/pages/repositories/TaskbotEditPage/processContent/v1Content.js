/**
 * Copyright (c) 2023 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import {
    combinePaginationFilters,
    Duration,
    generateUUID,
    setNextUUID,
    getRepositoryPath,
} from '@automationanywhere/rio-components';
import {matchExpression} from '@automationanywhere/rio-components/editor';
import {getVariableKey} from '@automationanywhere/rio-components/src/editor/utils/variables';

import {getAllFilesList} from '../../../../../store/api/repositories';
import {WORKSPACE_PRIVATE, WORKSPACE_PUBLIC} from '../../../../../store/constants/repositories';
import {getNode, replaceNodesDeep} from '../../../../editor/utils/nodes';

import {
    CASE_EXIT_STATUS_MAP,
    CONDITIONAL_MAP,
    EXECUTION_MODE,
    PROCESS_ATTRIBUTE_MAP,
    PROCESS_COMMANDNAME_MAP,
    PROCESS_NODE_TYPE,
    PROCESS_REQUEST_SEGMENT,
    PROCESS_VARIABLE_TYPE_ALLOW_DEFAULTS,
    USERGROUP_TYPECAST_PATTERN,
} from './constants';

let mockUUIDs = [];

export const setMockUUIDs = (array) => {
    mockUUIDs = array;
};

const setMockUUID = () => {
    if (mockUUIDs?.length > 0) {
        const nextUUID = mockUUIDs.shift();
        if (nextUUID) {
            setNextUUID(nextUUID);
        }
    }
};

const getBaseNode = (node) => ({
    commandName: PROCESS_COMMANDNAME_MAP[node.commandName],
    packageName: 'HBCWorkflow',
    uid: node.uid,
    attributes: [],
    children: [],
    layout: node.layout,
});

const getV1ChildScheduleNode = (node) => {
    setMockUUID();
    const scheduleNode = {
        children: [],
        attributes: [{name: 'stepId', value: {string: node.uid}}],
        commandName: 'schedule',
        packageName: 'HBCWorkflow',
        uid: generateUUID(),
    };
    return scheduleNode;
};

const replaceExpressions = (text, onMatch) => {
    if (!text || typeof text !== 'string') {
        return '';
    }
    const lastExpression = text;
    const nextExpressionParts = [];
    let lastIndex = 0;
    let expressionIndex;
    while ((expressionIndex = lastExpression.indexOf('$', lastIndex)) !== -1) {
        const match = matchExpression(lastExpression.slice(expressionIndex));
        if (!match) {
            nextExpressionParts.push(lastExpression.slice(lastIndex, expressionIndex + 1));
            lastIndex = expressionIndex + 1;
            continue;
        }
        nextExpressionParts.push(lastExpression.slice(lastIndex, expressionIndex));
        lastIndex = expressionIndex + match[0].length;
        nextExpressionParts.push(onMatch(match[0]));
    }
    nextExpressionParts.push(lastExpression.slice(lastIndex));
    return nextExpressionParts.join('');
};

// remove all methods and any arguments
const removeExpressionMethods = (expressionV2) => {
    let nextExpression = expressionV2;
    let match = null;
    while ((match = /([.][a-zA-Z]+[:][a-zA-Z]+([(][^)]*[)])?)/.exec(nextExpression))) {
        nextExpression = [
            nextExpression.slice(0, match.index),
            nextExpression.slice(match.index + match[0].length),
        ].join('');
    }
    return nextExpression;
};

const convertExpressionV2ToV1 = (expressionV2) => {
    if (!expressionV2 || typeof expressionV2 !== 'string') {
        return '';
    }
    const expressionV1 = replaceExpressions(expressionV2, (matched) => {
        let matchedExpression = matched;
        try {
            // Literal $$
            if (matchedExpression === '$$') {
                return matchedExpression;
            }
            // Remove all `.Package:method` calls
            matchedExpression = removeExpressionMethods(matchedExpression);
            // Global value expression
            if (matchedExpression.startsWith('$@')) {
                return matchedExpression;
            }
            let predicate = '';
            let accessors = '';
            // Task alias expression
            if (matchedExpression.startsWith('$&')) {
                const prefixParts = [];
                let aliasName = null;
                const aliasMatch = matchedExpression.match(/^([$][&]((\w|\s|[-_])+|["][^"]+["]))/);
                if (aliasMatch?.[2]) {
                    matchedExpression = matchedExpression.slice(aliasMatch[0].length);
                    aliasName = aliasMatch[2];
                    if (aliasName.startsWith('"') && aliasName.endsWith('"')) {
                        try {
                            aliasName = JSON.parse(aliasName);
                        }
                        catch (error) {
                            aliasName = aliasName.slice(-1, -1);
                        }
                    }
                }
                let isStart = false;
                if (aliasName === PROCESS_REQUEST_SEGMENT) {
                    isStart = true;
                }
                else if (aliasName) {
                    prefixParts.push(aliasName);
                }
                const sectionMatch = matchedExpression.match(/^([{]["]?(input|output|meta)["]?[}][{]([^}]+)[}])/);
                if (sectionMatch?.[3]) {
                    matchedExpression = matchedExpression.slice(sectionMatch[0].length);
                    const sectionName = sectionMatch[2];
                    let sectionItemKey = sectionMatch[3];
                    if (sectionItemKey.startsWith('"') && sectionItemKey.endsWith('"')) {
                        try {
                            sectionItemKey = JSON.parse(sectionItemKey);
                        }
                        catch (error) {
                            sectionItemKey = sectionItemKey.slice(-1, -1);
                        }
                    }
                    switch (sectionName) {
                        case 'meta':
                            prefixParts.push(isStart ? sectionItemKey : `.${sectionItemKey}`);
                            break;
                        case 'input':
                        case 'output':
                            prefixParts.push(isStart ? sectionName : `.${sectionName}`);
                            prefixParts.push(`[${sectionItemKey}]`);
                            break;
                    }
                }
                accessors = matchedExpression.slice(0, -1);
                predicate = prefixParts.join('');
            }
            // Input variable expression
            else {
                accessors = matchedExpression.replace(/^[$][a-zA-Z0-9_-]+/, '').slice(0, -1);
                const variableName = matchedExpression.slice(1, -(1 + accessors.length));
                predicate = `input[${variableName}]`;
            }
            return `$${predicate}${replaceExpressions(accessors, (matched) => convertExpressionV2ToV1(matched))}$`;
        }
        catch (error) {
            return matched;
        }
    });
    return expressionV1;
};

const convertValueWithExpression = (value) => {
    if (!value) {
        return;
    }
    let nextValue = value;
    const cloneNextValue = () => {
        nextValue = nextValue === value ? structuredClone(value) : nextValue;
    };
    if (!nextValue.type) {
        cloneNextValue();
        nextValue.type = 'STRING';
    }
    if (nextValue.expression) {
        cloneNextValue();
        nextValue.expression = convertExpressionV2ToV1(nextValue.expression);
    }
    else {
        switch (nextValue.type) {
            case 'LIST':
                if (nextValue.list?.length > 0) {
                    cloneNextValue();
                    nextValue.list = value.list.map((value) => convertValueWithExpression(value));
                }
                break;
            case 'DICTIONARY':
                if (nextValue.dictionary?.length > 0) {
                    cloneNextValue();
                    nextValue.dictionary = value.dictionary.map((entry) => {
                        return {
                            ...entry,
                            value: convertValueWithExpression(entry.value),
                        };
                    });
                }
                break;
            case 'AUTOMATION':
                if (nextValue?.automation?.inputVariables?.length > 0) {
                    cloneNextValue();
                    nextValue.automation.inputVariables = nextValue.automation.inputVariables.map((entry) => {
                        return {
                            ...entry,
                            value: convertValueWithExpression(entry.value),
                        };
                    });
                }
                if (nextValue?.automation?.inputOptions?.length > 0) {
                    cloneNextValue();
                    nextValue.automation.inputOptions = nextValue.automation.inputOptions.map((entry) => {
                        return {
                            ...entry,
                            value: convertValueWithExpression(entry.value),
                        };
                    });
                }
                break;
        }
    }
    return nextValue;
};

const getAttributeWithExpressions = (attribute) => {
    if (!attribute?.value) {
        return attribute;
    }
    const nextValue = convertValueWithExpression(attribute.value);
    return nextValue !== attribute.value
        ? {
            ...attribute,
            value: nextValue,
        }
        : attribute;
};

const getV1ChildGotoNode = (node) => {
    const gotoNode = {
        packageName: 'HBCWorkflow',
        commandName: 'schedule',
        attributes: [{name: 'stepId', value: {string: node.targetUid}}],
        children: [],
        editorMetadata: {isGoto: true},
        uid: node.uid,
        layout: {...node.layout},
    };
    // update target
    const targetAttribute = getAttributeWithExpressions(node.attributes.find((attribute) => attribute.name === 'target'));
    if (targetAttribute) {
        const overrides = targetAttribute.value.dictionary?.find((item) => item.key === 'overrides')?.value?.dictionary;
        const elementTypes = targetAttribute.value.dictionary?.find((item) => item.key === 'elementTypes')?.value?.dictionary;
        if (overrides) {
            const overrideDictionary = {
                type: 'DICTIONARY',
                dictionary: [],
            };
            overrides.forEach((entry) => {
                const key = entry?.key;
                if (!key) {
                    return;
                }
                let value = entry?.value;
                if (!value) {
                    return;
                }
                const elementType = elementTypes?.find((entry) => entry.key === key)?.value;
                switch (elementType?.string?.toUpperCase()) {
                    case 'DATE':
                        value = {
                            ...value,
                            type: 'DATETIME',
                        };
                        break;
                    case 'TIME':
                        value = {
                            ...value,
                            type: 'Time',
                        };
                        break;
                    case 'CHECKBOXGROUP':
                        value = {
                            ...value,
                        };
                        break;
                    case 'MULTISELECTDROPDOWN':
                    case 'RADIOBUTTONGROUP':
                    case 'DROPDOWN':
                        value = {
                            ...value,
                            type: 'STRING',
                        };
                        break;
                }
                if (value) {
                    overrideDictionary.dictionary.push({
                        key: entry.key,
                        value,
                    });
                }
            });
            gotoNode.attributes.push({
                name: 'stepOverride',
                value: overrideDictionary,
            });
        }
        const optionsEntries = targetAttribute.value.dictionary?.find((item) => item.key === 'options')?.value?.dictionary;
        if (optionsEntries) {
            const schemaDictionary = {
                type: 'DICTIONARY',
                dictionary: optionsEntries,
            };
            gotoNode.attributes.push({
                name: 'dynamicFormSchema',
                value: schemaDictionary,
            });
        }
    }
    return gotoNode;
};

const safeConvertToISOString = (dateString) => {
    try {
        // Remove timezone info in brackets (e.g., "[GMT-05:00]") from the end of the string
        const cleanedDate = dateString.replace(/\[.*\]$/, '');
        const date = new Date(cleanedDate);
        // Check if the date is valid
        if (isNaN(date.getTime())) {
            return dateString; // Return original string if date is invalid
        }
        return date.toISOString();
    }
    catch (error) {
        // Fallback to original string on any error
        return dateString;
    }
};

const mapV1ConditionalAttribute = (attributes) => {
    if (!attributes || !Array.isArray(attributes)) {
        return null;
    }
    return attributes.map((attribute) => {
        return {
            name: CONDITIONAL_MAP[attribute.name],
            value: convertValueWithExpression(attribute.value),
        };
    });
};

const mapV1DateConditionalAttribute = (attributes) => {
    const newConditionalAttributes = [];
    attributes.forEach((attribute) => {
        if (attribute.name === 'operator') {
            newConditionalAttributes.push({
                name: 'operator',
                value: attribute.value,
            });
            return;
        }
        newConditionalAttributes.push(
            {
                name: attribute.name === 'source' ? 'sourceDateTime' : 'destDateTime',
                value: attribute.value?.expression
                    ? convertValueWithExpression(attribute.value)
                    : {
                        type: 'DATETIME',
                        string: safeConvertToISOString(attribute.value.string),
                    },
            },
            {
                name: attribute.name === 'source' ? 'sourceDateOption' : 'destDateOption',
                value: {
                    type: 'STRING',
                    string: 'DATETIME',
                },
            },
        );
    });

    return newConditionalAttributes;
};

const convertOperatorAttribute = (opAttribute) => {
    const conditionalName = opAttribute.value?.conditionalName?.toLowerCase();
    const newOpAttribute = {
        name: 'condition',
        operator: opAttribute.operator,
        attributes: conditionalName === 'datetime'
            ? mapV1DateConditionalAttribute(opAttribute.attributes)
            : mapV1ConditionalAttribute(opAttribute.attributes),
        value: {
            conditionalName: `${conditionalName === 'datetime' ? 'date' : conditionalName}Variable`,
            packageName: opAttribute?.value?.conditionalName,
            type: opAttribute.value?.type,
        },
    };
    if (opAttribute.operatorAttribute) {
        newOpAttribute.operatorAttribute = convertOperatorAttribute(opAttribute.operatorAttribute);
    }
    return newOpAttribute;
};

const getConditionAttributeName = (node) => {
    if (node.commandName === PROCESS_NODE_TYPE.FILTER) {
        const filterType = node.attributes?.find((attribute) => attribute.name === 'filterType')?.value?.string;
        switch (filterType) {
            case 'NUMBER':
            case 'LIST':
            case 'DICTIONARY':
            case 'TABLE':
                // These filter types use the 'condition' attribute name
                break;
            default:
                // Otherwise we use the 'filter' attribute name
                return 'filter';
        }
    }
    return 'condition';
};

const convertV1ConditionalAttribute = (srcAttribute, node) => {
    const conditionalName = srcAttribute.value?.conditionalName?.toLowerCase();
    let newCondition = {
        name: getConditionAttributeName(node),
        attributes: [],
        value: {
            conditionalName: `${conditionalName === 'datetime' ? 'date' : conditionalName}Variable`,
            packageName: srcAttribute?.value?.conditionalName,
            type: srcAttribute.value?.type,
        },
    };
    if (srcAttribute.attributes) {
        newCondition.attributes = conditionalName === 'datetime'
            ? mapV1DateConditionalAttribute(srcAttribute.attributes)
            : mapV1ConditionalAttribute(srcAttribute.attributes);
    }
    if (srcAttribute.operatorAttribute) {
        newCondition = {...newCondition, operatorAttribute: convertOperatorAttribute(srcAttribute.operatorAttribute)};
    }
    return newCondition;
};

const getV1Attributes = (node) => {
    const v1Attributes = [];
    let v1Variables = [];
    const variableDefaultValueOverrideMap = new Map();
    let approvalApproveButtonLabel = {};
    let approvalDeclineButtonLabel = {};
    let overrideRequestAttributes = [];
    const editorMetadata = {};
    const convertVariables = (variables) => {
        let returnVariables = [];
        if (variables.length > 0) {
            returnVariables = variables.reduce((result, v2Variable) => {
                if (v2Variable?.name && v2Variable.input) {
                    result.push({
                        name: v2Variable.name,
                        type: v2Variable.type,
                        subtype: v2Variable.subtype,
                        description: v2Variable.description,
                        defaultValue: v2Variable.defaultValue,
                        input: true,
                        inputRequired: Boolean(v2Variable.inputRequired),
                        output: false,
                        readOnly: false,
                    });
                }
                return result;
            }, []);
        }
        return returnVariables;
    };
    // element name
    if (node.anchor && node.commandName !== PROCESS_NODE_TYPE.ROOT) {
        v1Attributes.push({
            name: 'stepAlias',
            value: node.anchor,
        });
    }
    // attributes for documentvalidation attribute
    if (node.commandName === PROCESS_NODE_TYPE.DOCUMENT_VALIDATION) {
        v1Attributes.push({
            name: 'sub_type',
            value: {type: 'STRING', string: 'IQBOT'},
        }, {
            name: 'stepInput',
            value: {
                type: 'TASKBOT',
                taskbotFile: {
                    type: 'FILE',
                    string: 'crdata://cognitive/validator/#/navigations/dw/pages/validator',
                },
                taskbotInput: {
                    type: 'DICTIONARY',
                    dictionary: [],
                },
            },
        },
        {
            name: 'inputSchema',
            value: {
                type: 'RECORD',
                record: {
                    schema: [
                        {
                            name: 'documentId',
                            type: 'STRING',
                        },
                        {
                            name: 'version',
                            type: 'STRING',
                        },
                    ],
                },
            },
        });
    }
    if (node.commandName === PROCESS_NODE_TYPE.DOCUMENT_EXTRACTION) {
        const hasLearningInstanceVersion = node.attributes.find((attr) => attr.name === 'learningInstanceVersion')?.value?.string !== '';
        const hasDocumentExtractionPackageVersion = node.attributes.find((attr) => attr.name === 'packageVersion')?.value?.string !== '';
        const isTaskBotProcess = node.attributes.find((attr) => attr.name === 'subType').value.string === 'TASKBOT';
        const inputSchema = [
            {
                name: 'InputFilePath',
                type: 'FILE',
            },
            {
                name: 'LearningInstanceName',
                type: 'STRING',
            },
        ];
        if (hasLearningInstanceVersion) {
            inputSchema.push({
                name: 'Version',
                type: 'STRING',
            });
        }
        if (hasDocumentExtractionPackageVersion) {
            inputSchema.push({
                name: 'PackageVersion',
                type: 'STRING',
            });
        }
        if (!isTaskBotProcess) {
            v1Attributes.push({
                name: 'stepInput',
                value: {
                    type: 'TASKBOT',
                    taskbotInput: {
                        type: 'DICTIONARY',
                        dictionary: [],
                    },
                },
            },
            {
                name: 'outputSchema',
                value: {
                    type: 'RECORD',
                    record: {
                        schema: [
                            {
                                name: 'DocumentID',
                                type: 'STRING',
                            },
                            {
                                name: 'Status',
                                type: 'STRING',
                            },
                            {
                                name: 'StatusMessage',
                                type: 'STRING',
                            },
                            {
                                name: 'StatusCode',
                                type: 'STRING',
                            },
                            {
                                name: 'ErrorModule',
                                type: 'STRING',
                            },
                            {
                                name: 'ErrorMessage',
                                type: 'STRING',
                            },
                        ],
                    },
                },
            },
            {
                name: 'inputSchema',
                value: {
                    type: 'RECORD',
                    record: {
                        schema: inputSchema,
                    },
                },
            });
        }
    }
    node.attributes.forEach((attr) => {
        // convert expressions from v2 -> v1 for non conditionals
        const attribute = getAttributeWithExpressions(attr);
        switch (attribute.name) {
            case 'startWith': {
                v1Attributes.push({name: 'initMethod', value: {string: PROCESS_ATTRIBUTE_MAP[attribute?.value?.string]}});
                break;
            }
            case 'startOutputVariables': {
                attribute.value.dictionary.forEach((outputVariables) => {
                    variableDefaultValueOverrideMap.set(outputVariables.key, {...outputVariables.value});
                });
                break;
            }
            case 'automation': {
                const value = {
                    type: 'TASKBOT',
                    taskbotFile: {
                        type: 'FILE',
                        string: attribute.value.automation.file?.string || attribute.value.automation.filePath?.string,
                    },
                };
                const dynamicFormSchemaInput = {};
                const automation = attribute.value.automation || {};
                const dynamicFormSchema = {name: 'dynamicFormSchema', value: {type: 'DICTIONARY', dictionary: []}};
                if (node.commandName !== PROCESS_NODE_TYPE.ROOT && automation.variables?.length > 0) {
                    const taskbotInput = {type: 'DICTIONARY', dictionary: []};
                    automation.variables.forEach((variable) => {
                        if (!variable) {
                            return;
                        }
                        const variableKey = getVariableKey(variable.name);
                        const elementType = variable.elementType;
                        const inputEntryRaw = automation.inputVariables?.find((entry) => getVariableKey(entry?.key) === variableKey);
                        const inputOptionsValue = automation.inputOptions?.find((entry) => getVariableKey(entry?.key) === variableKey)?.value;
                        const inputEntry = inputEntryRaw ? structuredClone(inputEntryRaw) : null;
                        if (inputEntry?.value) {
                            inputEntry.value.type = elementType === 'Image' ? elementType : inputEntry.value.type?.toUpperCase() ?? 'STRING';
                        }
                        if (elementType) {
                            let dynamicDefault = null;
                            let dynamicValue = null;
                            let dynamicDictionaryValue = null;
                            if (inputEntry?.key) {
                                switch (elementType.toUpperCase()) {
                                    case 'CHECKBOXGROUP':
                                        // variable
                                        if (inputEntry.value?.expression) {
                                            const value = {
                                                type: inputOptionsValue?.type || 'LIST',
                                                expression: inputEntry.value.expression,
                                            };
                                            taskbotInput.dictionary.push({
                                                key: inputEntry.key,
                                                type: elementType,
                                                value,
                                            });
                                            dynamicDefault = value;
                                        }
                                        // single entry
                                        else if (
                                            inputEntry.value?.dictionary?.length === 1 &&
                                            inputEntry.value?.dictionary.at(0)?.key
                                        ) {
                                            const entry = inputEntry.value?.dictionary.at(0);
                                            taskbotInput.dictionary.push({
                                                key: inputEntry.key,
                                                type: elementType,
                                                value: {
                                                    type: 'LIST',
                                                    list: [
                                                        {string: entry.key},
                                                    ],
                                                },
                                            });
                                            dynamicDefault = {type: null, string: entry.key};
                                        }
                                        // multiple entry
                                        else if (inputEntry?.value?.dictionary?.length > 0) {
                                            const keys = inputEntry.value.dictionary
                                                .map((entry) => entry.key);
                                            if (keys.length > 0) {
                                                taskbotInput.dictionary.push({
                                                    key: inputEntry.key,
                                                    type: elementType,
                                                    value: {
                                                        type: 'LIST',
                                                        list: keys.map((key) => ({
                                                            type: 'STRING',
                                                            string: key,
                                                        })),
                                                    },
                                                });
                                                dynamicDefault = {
                                                    type: 'DICTIONARY',
                                                    string: keys.join(','),
                                                };
                                            }
                                        }
                                        break;
                                    case 'MULTISELECTDROPDOWN':
                                        // variable
                                        if (inputEntry.value?.expression) {
                                            taskbotInput.dictionary.push({
                                                key: inputEntry.key,
                                                type: elementType,
                                                value: {
                                                    type: 'STRING',
                                                    expression: inputEntry.value.expression,
                                                },
                                            });
                                            dynamicDefault = {
                                                type: 'LIST',
                                                expression: inputEntry.value.expression,
                                            };
                                        }
                                        // single entry
                                        else if (inputEntry.value?.list?.length === 1 && inputEntry.value?.list.at(0)?.expression) {
                                            const entryValue = inputEntry.value.list.at(0);
                                            if (entryValue?.expression) {
                                                const value = {
                                                    type: 'STRING',
                                                    expression: entryValue.expression,
                                                };
                                                taskbotInput.dictionary.push({
                                                    key: inputEntry.key,
                                                    type: elementType,
                                                    value,
                                                });
                                                dynamicDefault = value;
                                            }
                                            else {
                                                taskbotInput.dictionary.push({
                                                    key: inputEntry.key,
                                                    type: elementType,
                                                    value: {
                                                        string: entryValue?.string || '',
                                                    },
                                                });
                                                dynamicDefault = {
                                                    type: 'LIST',
                                                    string: entryValue?.string || '',
                                                };
                                            }
                                        }
                                        // multiple entry
                                        else if (inputEntry.value?.list?.length > 0) {
                                            const hasExpression = inputEntry.value.list.some((value) => value?.expression);
                                            const value = {
                                                [hasExpression ? 'expression' : 'string']: inputEntry.value.list
                                                    .map((value) => value?.expression
                                                        ? value.expression
                                                        : value?.string || '')
                                                    .join(','),
                                            };
                                            taskbotInput.dictionary.push({
                                                key: inputEntry.key,
                                                type: elementType,
                                                value,
                                            });
                                            dynamicDefault = value;
                                        }
                                        break;
                                    case 'RADIOBUTTONGROUP':
                                    case 'DROPDOWN':
                                        taskbotInput.dictionary.push(inputEntry);
                                        if (inputEntry.value?.expression) {
                                            dynamicDefault = {type: 'STRING', expression: inputEntry.value.expression};
                                        }
                                        else if (inputEntry.value?.string) {
                                            dynamicDefault = {type: '', string: inputEntry.value.string};
                                        }
                                        break;
                                    case 'DATE':
                                        if (inputEntry.value?.string) {
                                            taskbotInput.dictionary.push({
                                                key: inputEntry.key,
                                                value: {
                                                    type: 'DATETIME',
                                                    string: inputEntry.value.string,
                                                },
                                            });
                                        }
                                        else if (inputEntry.value?.expression) {
                                            taskbotInput.dictionary.push({
                                                key: inputEntry.key,
                                                value: {
                                                    type: 'DATETIME',
                                                    expression: inputEntry.value.expression,
                                                },
                                            });
                                        }
                                        break;
                                    case 'TIME': {
                                        if (inputEntry.value?.string) {
                                            taskbotInput.dictionary.push({
                                                key: inputEntry.key,
                                                value: {
                                                    type: 'Time',
                                                    string: inputEntry.value?.string,
                                                },
                                            });
                                        }
                                        else if (inputEntry.value?.expression) {
                                            taskbotInput.dictionary.push({
                                                key: inputEntry.key,
                                                value: {
                                                    type: 'Time',
                                                    expression: inputEntry.value.expression,
                                                },
                                            });
                                        }
                                        break;
                                    }
                                    default:
                                        if (inputEntry.value) {
                                            taskbotInput.dictionary.push(inputEntry);
                                        }
                                        break;
                                }
                            }
                            if (inputOptionsValue) {
                                switch (elementType.toUpperCase()) {
                                    case 'CHECKBOXGROUP':
                                    case 'MULTISELECTDROPDOWN':
                                    case 'RADIOBUTTONGROUP':
                                    case 'DROPDOWN':
                                        // variable
                                        if (inputOptionsValue?.expression) {
                                            dynamicValue = {
                                                type: 'LIST',
                                                expression: inputOptionsValue.expression,
                                            };
                                            dynamicDictionaryValue = dynamicValue;
                                        }
                                        // single entry
                                        else if (inputOptionsValue?.list?.length === 1) {
                                            const itemValue = inputOptionsValue.list.at(0);
                                            const type = ['CHECKBOXGROUP', 'DROPDOWN'].includes(elementType.toUpperCase())
                                                ? ''
                                                : 'STRING';
                                            if (itemValue.expression) {
                                                dynamicValue = {
                                                    type,
                                                    expression: itemValue.expression,
                                                };
                                                dynamicDictionaryValue = dynamicValue;
                                            }
                                            else if (itemValue.string) {
                                                dynamicValue = {
                                                    type: '',
                                                    string: itemValue.string,
                                                };
                                                dynamicDictionaryValue = {
                                                    type: 'LIST',
                                                    list: [
                                                        {string: itemValue.string},
                                                    ],
                                                };
                                            }
                                        }
                                        // multiple entry
                                        else if (inputOptionsValue?.list?.length > 0) {
                                            if (inputOptionsValue.list.some((entry) => entry.expression)) {
                                                dynamicValue = {
                                                    type: null,
                                                    expression: inputOptionsValue.list
                                                        .map((entry) => entry?.expression || entry?.string || '')
                                                        .join(','),
                                                };
                                                dynamicDictionaryValue = dynamicValue;
                                            }
                                            else {
                                                dynamicValue = {
                                                    type: null,
                                                    string: inputOptionsValue.list
                                                        .map((entry) => entry?.string || '')
                                                        .join(','),
                                                };
                                                dynamicDictionaryValue = {
                                                    type: 'LIST',
                                                    list: inputOptionsValue.list,
                                                };
                                            }
                                        }
                                        break;
                                }
                            }
                            if (dynamicDefault || dynamicValue) {
                                dynamicFormSchemaInput[variableKey] = {
                                    key: variableKey,
                                    elementType,
                                    default: dynamicDefault || {type: null, string: ''},
                                    value: dynamicValue || {type: null, string: ''},
                                };
                                const inputOptions = automation.inputOptions?.find((entry) => getVariableKey(entry?.key) === variableKey);
                                if (dynamicDictionaryValue) {
                                    dynamicFormSchema.value.dictionary.push({
                                        key: inputOptions.key,
                                        type: elementType,
                                        value: dynamicDictionaryValue,
                                    });
                                }
                            }
                        }
                        else if (inputEntry) {
                            taskbotInput.dictionary.push(inputEntry);
                        }
                    });
                    value.taskbotInput = taskbotInput;
                }
                if (automation.variables?.length > 0 && node.commandName === PROCESS_NODE_TYPE.ROOT) {
                    v1Variables = [...v1Variables, ...convertVariables(attribute.value?.automation?.variables)];
                }
                v1Attributes.push({
                    name: PROCESS_ATTRIBUTE_MAP[attribute.name],
                    value,
                });
                if (dynamicFormSchema.value.dictionary.length > 0) {
                    v1Attributes.push(dynamicFormSchema);
                }
                if (Object.keys(dynamicFormSchemaInput).length > 0) {
                    editorMetadata.dynamicFormSchemaInput = dynamicFormSchemaInput;
                }
                break;
            }
            case 'version':
            case 'documentId': {
                const stepInputAttribute = v1Attributes.find((attribute) => attribute.name === 'stepInput');
                stepInputAttribute.value?.taskbotInput?.dictionary?.push({
                    key: attribute.name,
                    value: attribute.value,
                });
                break;
            }
            case 'formButtons': {
                v1Attributes.push({
                    name: attribute.name,
                    value: {
                        dictionary: attribute.value.list.map((button) => ({
                            value: {string: button.dictionary[0]?.value.string?.toLowerCase()},
                            key: (button.dictionary[1]?.value.string ?? '').trim(),
                        })),
                        type: 'DICTIONARY',
                    },
                });
                break;
            }
            case 'stepAttributes':
            case 'requestAttributes': {
                const rows = [];
                attribute.value?.list?.forEach((businessAttribute) => {
                    if (!businessAttribute?.dictionary?.length) {
                        return;
                    }
                    const attributeType = businessAttribute.dictionary
                        .find(({key}) => key === 'type')
                        ?.value
                        ?.string || 'STRING';
                    const valueAssignment = {type: attributeType};
                    const values = [
                        {
                            type: 'STRING',
                            string:  businessAttribute.dictionary
                                .find(({key}) => key === 'label')
                                ?.value
                                ?.string
                                ?.replaceAll(' ', '_') || '',
                        },
                        {
                            type: 'STRING',
                            string: businessAttribute.dictionary.find(({key}) => key === 'visibility')
                                ?.value
                                ?.string || 'VISIBLE',
                        },
                    ];
                    const attributeValue = businessAttribute.dictionary
                        .find(({key}) => key === 'value')
                        ?.value;
                    if (attributeValue?.expression) {
                        valueAssignment.expression = attributeValue.expression;
                    }
                    else {
                        switch (attributeType) {
                            case 'STRING':
                            case 'DATETIME':
                                valueAssignment.string = attributeValue?.string || '';
                                break;
                            case 'NUMBER':
                                valueAssignment.number = attributeValue?.number || '';
                                break;
                            case 'BOOLEAN':
                                valueAssignment.boolean = attributeValue?.boolean === true ? 'TRUE' : 'FALSE';
                                break;
                        }
                    }
                    values.push(valueAssignment);
                    rows.push({values});
                });
                const businessAttributes = {
                    name: attribute.name,
                    value: {
                        type: 'TABLE',
                        table: {
                            schema: [
                                {
                                    name: 'AttributeName',
                                    type: 'STRING',
                                },
                                {
                                    name: 'AttributeProperty',
                                    type: 'STRING',
                                },
                                {
                                    name: 'AttributeValue',
                                    type: 'ANY',
                                },
                            ],
                            rows,
                        },
                    },
                };
                if ((
                    node.commandName === PROCESS_NODE_TYPE.IF ||
                    node.commandName === PROCESS_NODE_TYPE.ELSE ||
                    node.commandName === PROCESS_NODE_TYPE.ELSEIF
                ) && attribute.name === 'requestAttributes') {
                    overrideRequestAttributes = [businessAttributes];
                }
                else {
                    v1Attributes.push(businessAttributes);
                }
                break;
            }
            case 'hideTask': {
                v1Attributes.push({
                    name: 'hidden',
                    value: {type: 'BOOLEAN', boolean: attribute.value.boolean?.toString()},
                });
                break;
            }
            case 'formMode': {
                v1Attributes.push({
                    name: 'readOnly',
                    value: {type: 'BOOLEAN', boolean: String(attribute.value.string === 'READONLY')},
                });
                break;
            }
            case 'queueTimeout': {
                const duration = Duration.parse(attribute.value?.string).seconds;
                const hours = Math.floor(duration / 3600) || 0;
                const minutes = Math.floor((duration % 3600) / 60) || 0;
                v1Attributes.push({
                    name: 'taskExpirationHours',
                    value: {
                        string: String(hours),
                    },
                });
                v1Attributes.push({
                    name: 'taskExpirationMinutes',
                    value: {
                        string: String(minutes),
                    },
                });
                break;
            }
            case 'taskExpirationTimeCustom': {
                const duration = Duration.parse(attribute.value?.string).seconds;
                const days = Math.floor(duration / 86400) || 0;
                const hours = Math.floor((duration % 86400) / 3600) || 0;
                const minutes = Math.floor((duration % 3600) / 60) || 0;
                v1Attributes.push({
                    name: 'taskExpirationDays',
                    value: {
                        string: String(days),
                    },
                });
                v1Attributes.push({
                    name: 'taskExpirationHours',
                    value: {
                        string: String(hours),
                    },
                });
                v1Attributes.push({
                    name: 'taskExpirationMinutes',
                    value: {
                        string: String(minutes),
                    },
                });
                break;
            }
            case 'taskExpirationTime': {
                const {type, string} = attribute.value;
                if (string === 'NONE') {
                    break;
                }
                v1Attributes.push({name: attribute.name, value: {type, string: string.toLowerCase()}});
                break;
            }
            case 'executionMode': {
                v1Attributes.push({name: 'allowLocalRun', value:{type: 'BOOLEAN', boolean: [EXECUTION_MODE.LOCAL_MAIN, EXECUTION_MODE.LOCAL_CHILD].includes(attribute.value?.string)}});
                v1Attributes.push({name: 'runInChildWindow', value:{type: 'BOOLEAN', boolean: EXECUTION_MODE.LOCAL_CHILD === attribute.value?.string}});
                break;
            }
            case 'conditional': {
                v1Attributes.push(convertV1ConditionalAttribute(attribute, node));
                // default attribute for filter node
                if (node.commandName === PROCESS_NODE_TYPE.FILTER && v1Attributes.some((attribute) => attribute.name === 'filter')) {
                    v1Attributes.push({
                        name: 'collect',
                        value: {type: 'BOOLEAN', boolean: 'true'},
                    });
                }
                break;
            }
            case 'requestTitle': {
                const name = [PROCESS_NODE_TYPE.ROOT, PROCESS_NODE_TYPE.END].includes(node.commandName) ? 'caseTitle' : 'stepTitle';
                v1Attributes.push({name, value: attribute.value});
                break;
            }
            // assignment
            case 'taskRequester':
            case 'taskAssignment': {
                if (attribute.value?.string === 'CUSTOM') {
                    break;
                }
                v1Attributes.push({
                    name: PROCESS_ATTRIBUTE_MAP[attribute.name],
                    value: {
                        type: 'USERGROUP',
                        expression: attribute.value?.string === 'ASSIGNED_GROUP' ? '$assignedToGroup$' : '$createdByUser$',
                    },
                });
                break;
            }
            case 'taskRequesterGroup':
            case 'targetUsers':
            case 'taskAssignmentGroup': {
                if (
                    attr.value?.type === 'USERGROUP'
                    && attr.value.expression
                    && USERGROUP_TYPECAST_PATTERN.test(attr.value.expression)
                ) {
                    const typecastMatch = attr.value.expression.match(USERGROUP_TYPECAST_PATTERN);
                    const typecastMethod = typecastMatch ? typecastMatch[1] : '';
                    const convertedExpression = attribute.value.expression.replace(/\$$/, `${typecastMethod}$`);
                    v1Attributes.push({
                        name: PROCESS_ATTRIBUTE_MAP[attribute.name],
                        value: {
                            type: 'USERGROUP',
                            expression: convertedExpression,
                        },
                    });
                }
                else if (attribute.value?.type === 'USERGROUP' && attribute.value.expression) {
                    v1Attributes.push({
                        name: PROCESS_ATTRIBUTE_MAP[attribute.name],
                        value: {
                            type: 'STRING',
                            expression: node.commandName === PROCESS_NODE_TYPE.PROCESS
                                ? [attribute.value.expression]
                                : attribute.value.expression,
                        },
                    });
                }
                else if (attribute.value?.type === 'USERGROUP' && attribute.value.userGroup) {
                    v1Attributes.push({
                        name: PROCESS_ATTRIBUTE_MAP[attribute.name],
                        value: {
                            type: 'USERGROUP',
                            userGroup: attribute.value.userGroup,
                        },
                    });
                }
                break;
            }
            case 'taskContributor': {
                if (attribute.value.string === 'MANUAL') {
                    break;
                }
                v1Attributes.push({name: 'autoAssign', value: {string: attribute.value.string}});
                break;
            }
            case 'specificUser': {
                if (attribute?.value?.type === 'number') {
                    v1Attributes.push({name: 'autoAssignUser', value: {number: attribute.value.number}});
                    break;
                }
                v1Attributes.push({name: 'autoAssignUser', value: {expression: attribute.value.expression}});
                break;
            }
            case 'requiredApprovalCount': {
                v1Attributes.push({name: 'noOfApproval', value: {string: attribute.value.number}});
                break;
            }
            case 'approveButtonLabel': {
                if (attribute.value.string === 'CUSTOM') {
                    const approveCustomLabel = node.attributes.find((attribute) => attribute.name === 'approveButtonCustomLabel');
                    approvalApproveButtonLabel = {
                        key: 'custom_label',
                        value: {string: approveCustomLabel?.value.string},
                    };
                    break;
                }
                approvalApproveButtonLabel = {
                    key: 'standard_label',
                    value: {string: attribute.value.string},
                };
                break;
            }
            case 'declineButtonLabel': {
                if (attribute.value.string === 'CUSTOM') {
                    const declineButtonCustomLabel = node.attributes.find((attribute) => attribute.name === 'declineButtonCustomLabel');
                    approvalDeclineButtonLabel = {
                        key: 'custom_label',
                        value: {string: declineButtonCustomLabel?.value.string},
                    };
                    break;
                }
                approvalDeclineButtonLabel = {
                    key: 'standard_label',
                    value: {string: attribute.value.string},
                };
                break;
            }
            // filter's attributes
            // TODO: filterType doesn't have ELEMENT
            case 'valueToFilter': {
                v1Attributes.push({
                    name: PROCESS_ATTRIBUTE_MAP[attribute.name] || attribute.name,
                    value: {...attribute.value, type: attribute.value.expressionType},
                });
                break;
            }
            case 'filterType': {
                v1Attributes.push({
                    name: 'iteration_type',
                    value: {
                        string: ['DICTIONARY_ENTRY', 'LIST_ENTRY', 'TABLE_ROW', 'RECORD_ENTRY'].includes(attribute.value.string)
                            ? 'ELEMENT'
                            : attribute.value.string === 'TABLE_COLUMN'
                                ? 'SCHEMA'
                                : 'VALUE',
                    },
                });
                break;
            }
            case 'approveButtonCustomLabel':
            case 'declineButtonCustomLabel':
            case 'taskRequesterAndAssignment':
                break;
            case 'status': {
                v1Attributes.push({
                    name: PROCESS_ATTRIBUTE_MAP[attribute.name] || attribute.name,
                    value: {string: CASE_EXIT_STATUS_MAP[attribute.value?.string]},
                });
                break;
            }
            case 'message': {
                if (node.commandName === PROCESS_NODE_TYPE.END) {
                    v1Attributes.push({
                        name: 'caseStatus',
                        value: {...attribute.value},
                    });
                }
                else {
                    v1Attributes.push({
                        name: 'stepStatus',
                        value: {...attribute.value},
                    });
                }
                break;
            }
            case 'subType' : {
                v1Attributes.push({
                    name: 'sub_type',
                    value: attribute.value,
                });
                break;
            }
            case 'inputFilePath': {
                const stepInputAttribute = v1Attributes.find((attribute) => attribute.name === 'stepInput');
                stepInputAttribute.value?.taskbotInput?.dictionary?.push({
                    key: 'InputFilePath',
                    value: attribute.value,
                });
                break;
            }
            case 'learningInstanceName': {
                const stepInputAttribute = v1Attributes.find((attribute) => attribute.name === 'stepInput');
                stepInputAttribute.value?.taskbotInput?.dictionary?.push({
                    key: 'LearningInstanceName',
                    value: attribute.value,
                });
                break;
            }
            case 'learningInstanceVersion': {
                if (attribute.value?.string || attribute.value?.expression) {
                    const stepInputAttribute = v1Attributes.find((attribute) => attribute.name === 'stepInput');
                    stepInputAttribute.value?.taskbotInput?.dictionary?.push({
                        key: 'Version',
                        value: attribute.value,
                    });
                }
                break;
            }
            case 'packageVersion': {
                if (attribute.value?.string || attribute.value?.expression) {
                    const stepInputAttribute = v1Attributes.find((attribute) => attribute.name === 'stepInput');
                    stepInputAttribute.value?.taskbotInput?.dictionary?.push({
                        key: 'PackageVersion',
                        value: attribute.value,
                    });
                }
                break;
            }
            case 'outputVariables': {
                const variableOutputOverride = [];
                attribute.value.dictionary.forEach((outputVariables) => {
                    const value = {...outputVariables.value};
                    variableOutputOverride.push({
                        key: outputVariables.key,
                        value,
                    });
                });
                v1Attributes.push({
                    name: 'caseOutput',
                    value: {
                        type: 'DICTIONARY',
                        dictionary: variableOutputOverride,
                    },
                });

                break;
            }
            default: {
                v1Attributes.push({
                    name: PROCESS_ATTRIBUTE_MAP[attribute.name] || attribute.name,
                    value: attribute.value,
                });
                break;
            }
        }
    });
    // adding approval's buttons
    if (node.commandName === PROCESS_NODE_TYPE.APPROVAL) {
        v1Attributes.push({
            name: 'formButtonV2',
            value: {
                type: 'TABLE',
                table: {
                    rows: [{values: [{
                        type: 'DICTIONARY',
                        dictionary: [
                            {key: 'action', value: {string: 'Approve'}},
                            {key: 'result_value', value: {string: 'something'}},
                            {key: 'type', value: {string: 'PRIMARY'}},
                            approvalApproveButtonLabel,
                        ],
                    }, {
                        type: 'DICTIONARY',
                        dictionary: [
                            {key: 'action', value: {string: 'Decline'}},
                            {key: 'result_value', value: {string: 'something'}},
                            {key: 'type', value: {string: 'SECONDARY'}},
                            approvalDeclineButtonLabel,
                        ],
                    }]}],
                },
            },
        });
    }
    return {v1Attributes, v1Variables, variableDefaultValueOverrideMap, editorMetadata, overrideRequestAttributes};
};

const getV1ChildExitNode = (node) => {
    const endNode = {
        commandName: 'exit',
        packageName: 'HBCWorkflow',
        uid: node.uid,
        attributes: [],
        layout: {...node.layout},
    };
    endNode.attributes = getV1Attributes(node).v1Attributes;
    return endNode;
};

const getV1ChildLogicalNode = (node) => {
    const logicalNode = {
        commandName: 'if',
        packageName: 'If',
        uid: node.uid,
        attributes: [],
        branches: [],
        children: [],
        layout: {...node.layout},
    };
    const v1NodeAttributes = getV1Attributes(node);
    logicalNode.attributes = v1NodeAttributes.v1Attributes;
    if (v1NodeAttributes.overrideRequestAttributes.length > 0 && node.commandName === PROCESS_NODE_TYPE.IF) {
        setMockUUID();
        logicalNode.children.push({
            packageName: 'HBCWorkflow',
            commandName: 'bizattribute',
            attributes: v1NodeAttributes.overrideRequestAttributes,
            children: [],
            uid: generateUUID(),
        });
    }
    const firstChild = node.children.at(0);
    if (firstChild) {
        let newChild = {};
        if (firstChild.commandName === PROCESS_NODE_TYPE.END) {
            newChild = getV1ChildExitNode(firstChild);
        }
        else if (firstChild.commandName === PROCESS_NODE_TYPE.GOTO) {
            newChild = getV1ChildGotoNode(firstChild);
        }
        else {
            newChild = getV1ChildScheduleNode(firstChild);
        }
        logicalNode.children.push(newChild);
    }
    node.branches?.forEach((branch) => {
        const branchChildren = [];
        const v1BranchAttributes = getV1Attributes(branch);
        if (v1BranchAttributes.overrideRequestAttributes.length > 0 &&
            (
                branch.commandName === PROCESS_NODE_TYPE.ELSEIF ||
                branch.commandName === PROCESS_NODE_TYPE.ELSE
            )) {
            setMockUUID();
            branchChildren.push({
                packageName: 'HBCWorkflow',
                commandName: 'bizattribute',
                attributes: v1BranchAttributes.overrideRequestAttributes,
                children: [],
                uid: branch.uid || generateUUID(),
            });
        }
        if (branch?.children?.length > 0) {
            const firstBranchChild = branch.children.at(0);
            let newBranchChild = {};
            if (firstBranchChild.commandName === PROCESS_NODE_TYPE.END) {
                newBranchChild = getV1ChildExitNode(firstBranchChild);
            }
            else if (firstBranchChild.commandName === PROCESS_NODE_TYPE.GOTO) {
                newBranchChild = getV1ChildGotoNode(firstBranchChild);
            }
            else {
                newBranchChild = getV1ChildScheduleNode(firstBranchChild);
            }

            branchChildren.push(newBranchChild);
        }
        logicalNode.branches.push({
            ...branch,
            attributes: v1BranchAttributes.v1Attributes,
            children: branchChildren,
            packageName: PROCESS_ATTRIBUTE_MAP[branch.packageName],
            commandName: PROCESS_COMMANDNAME_MAP[branch.commandName],
        });
    });
    return logicalNode;
};

const processChildNodes = (node) => {
    if (node?.commandName === PROCESS_NODE_TYPE.END) {
        return getV1ChildExitNode(node);
    }
    if (node?.commandName === PROCESS_NODE_TYPE.IF) {
        return getV1ChildLogicalNode(node);
    }
    if (node?.commandName === PROCESS_NODE_TYPE.GOTO) {
        return getV1ChildGotoNode(node);
    }
    return getV1ChildScheduleNode(node);
};

const convertToV1Node = (node, nextNode) => {
    const v1Node = getBaseNode(node);
    // process attribute
    const {v1Attributes, v1Variables, variableDefaultValueOverrideMap, editorMetadata} = getV1Attributes(node);
    v1Node.attributes = [...v1Attributes];
    if (editorMetadata?.dynamicFormSchemaInput) {
        v1Node.editorMetadata = {...editorMetadata};
    }
    // process children
    if (nextNode && (!nextNode?.parentUid || nextNode?.parentUid === node.parentUid)) {
        v1Node.children.push(processChildNodes(nextNode, node));
    }
    return {v1Node, v1Variables, variableDefaultValueOverrideMap};
};

const getV1ChildProcesses = async(processFilePaths) => {
    const [{list: publicFiles}, {list: privateFiles}] = await Promise.all([
        !processFilePaths.size
            ? Promise.resolve({list: []})
            : getAllFilesList(null, WORKSPACE_PUBLIC, {
                fields: [],
                filter: combinePaginationFilters(
                    'or',
                    [...processFilePaths].map((path) => ({
                        operator: 'eq',
                        field: 'path',
                        value: path,
                    })),
                ),
                page: {offset: 0, length: processFilePaths.size},
                sort: [{field: 'name', direction: 'asc'}],
            }),
        !processFilePaths.size
            ? Promise.resolve({list: []})
            : getAllFilesList(null, WORKSPACE_PRIVATE, {
                fields: [],
                filter: combinePaginationFilters(
                    'or',
                    [...processFilePaths].map((path) => ({
                        operator: 'eq',
                        field: 'path',
                        value: path,
                    })),
                ),
                page: {offset: 0, length: processFilePaths.size},
                sort: [{field: 'name', direction: 'asc'}],
            }),
    ]);
    const privateFilePaths = new Set(privateFiles.map((file) => file.path));
    const files = [...privateFiles];
    publicFiles.forEach((file) => {
        if (!privateFilePaths.has(file.path)) {
            files.push(file);
        }
    });
    return files;
};

const getFlattenedNodes = (nodes) => {
    let flatNodes = [];
    nodes?.forEach((node) => {
        if ([PROCESS_NODE_TYPE.IF, PROCESS_NODE_TYPE.ELSE, PROCESS_NODE_TYPE.ELSEIF].includes(node.commandName)) {
            if (node.commandName === PROCESS_NODE_TYPE.IF) {
                flatNodes.push(node);
            }

            const childNodes = getFlattenedNodes(node.children).map((childNode) => ({...childNode, parentUid: node.uid}));
            flatNodes = [...flatNodes, ...childNodes, ...getFlattenedNodes(node.branches)];
        }
        else {
            flatNodes.push(node);
        }
    });
    return flatNodes;
};

// Method to set "aariUserDefined" prop for backward compatibility
// Can be removed once V1 composer is retired
const setUserDefinedVariables = (content) => {
    const {variables, nodes} = content;
    const startNode = nodes[0];
    const attributes = startNode?.attributes;
    const initMethod = attributes.find((attr) => attr?.name === 'initMethod') || {};
    const initMethodType = initMethod?.value?.string;
    if (variables.length === 0) {
        return content;
    }
    const newVariables = variables.map((variable) => {
        const {output: isOutput, input: isInput, type} = variable;
        if (initMethodType === 'INIT_BY_INPUT' || (initMethodType === 'INIT_BY_FORM' && (isOutput && !isInput))) {
            variable.aariUserDefined = true;
        }

        // add default value to file type variables to support v1 backend
        if (PROCESS_VARIABLE_TYPE_ALLOW_DEFAULTS.includes(type)) {
            variable.defaultValue = {type, string: ''};
        }
        variable.subType = variable.subtype ?? 'ANY';
        variable.label = variable.name;
        variable.processVariableType = variable.input ? 'input' : 'output';
        if (variable.input) {
            variable.value = `$input[${variable.name}]$`;
        }
        return variable;
    });
    return {
        ...content,
        variables: newVariables,
    };
};

export const getProcessV1Content = async(v2Content) => {
    const content = {
        nodes: [],
        orphans: v2Content.orphans ?? [],
        swimlanes: v2Content.swimlanes ?? [],
        swimlaneStacking: v2Content.swimlaneStacking ?? 'LEFT_TO_RIGHT',
        variables: v2Content.variables ?? [],
        // This will temporarily be used to detect that the file was saved by the v2 editor
        isProcessV2: true,
    };
    let flatNodes = getFlattenedNodes(v2Content.nodes);
    const processFilePaths = new Set();
    flatNodes = replaceNodesDeep(
        flatNodes,
        (nodes) => {
            let hasUpdate = false;
            const nextNodes = nodes.map((node) => {
                // process goto nodes to find its target uid
                if (node.commandName === PROCESS_NODE_TYPE.GOTO) {
                    hasUpdate = true;
                    const targetAttribute = node.attributes.find((attribute) => attribute.name === 'target');
                    const targetElementId = targetAttribute?.value?.string || targetAttribute?.value?.dictionary.find((entry) => entry.key === 'name')?.value?.string;
                    if (targetElementId) {
                        const targetUid = getNode(flatNodes, (node) => node.anchor?.string === targetElementId)?.uid;
                        return {...node, targetUid};
                    }
                }
                // finding process nodes
                if (node.commandName === PROCESS_NODE_TYPE.PROCESS) {
                    const fileUri = node.attributes.find(({name}) => name === 'automation')?.value?.automation?.filePath?.string;
                    const filePath = getRepositoryPath(fileUri);
                    if (filePath) {
                        processFilePaths.add(filePath);
                    }
                }
                return node;
            });
            return hasUpdate ? nextNodes : nodes;
        },
    );
    flatNodes.forEach((node, index) => {
        if (![PROCESS_NODE_TYPE.IF, PROCESS_NODE_TYPE.END, PROCESS_NODE_TYPE.GOTO].includes(node.commandName)) {
            const nextNode = flatNodes.at(index + 1);
            const {v1Node, v1Variables, variableDefaultValueOverrideMap} = convertToV1Node(node, nextNode);
            content.nodes.push(v1Node);
            if (v1Variables?.length > 0) {
                content.variables = [...content.variables, ...v1Variables];
            }
            if (variableDefaultValueOverrideMap?.size > 0) {
                content.variables = content.variables.map((variable) => {
                    const defaultValueOverride = variableDefaultValueOverrideMap.get(variable.name);
                    if (defaultValueOverride) {
                        return {...variable, defaultValue: defaultValueOverride};
                    }
                    return variable;
                });
            }
        }
    });
    if (processFilePaths.size > 0) {
        content.childProcesses = [...await getV1ChildProcesses(processFilePaths)];
    }
    return setUserDefinedVariables(content);
};
