/**
 * Copyright (c) 2020 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import {
    asyncForEach,
    combinePaginationFilters,
    crier,
    Duration,
    generateUUID,
    getFileUri,
} from '@automationanywhere/rio-components';
import {getVariableKey} from '@automationanywhere/rio-components/src/editor/utils/variables';
import {getAutoLayout} from '@automationanywhere/rio-components/src/components/team/editor/CanvasRenderer';
import {
    getVariableMap,
    processExpression,
    VALUE_TYPE_RECORD,
    VALUE_TYPE_DICTIONARY,
    VALUE_TYPE_LIST,
    VALUE_TYPE_TABLE,
    REGEX_VARIABLE_NAME,
    REGEX_EXPRESSION_KEY,
} from '@automationanywhere/rio-components/editor';
import moment from 'moment';

import {forNodes} from '../../../../editor/utils/nodes';
import {getFormFileInterface, getProcessFileInterface} from '../../../../editor/TaskbotAutomationField/utils';
import {getAllFilesList, getFileInterface} from '../../../../../store/api/repositories';
import {getGlobalValueListBasic} from '../../../../../store/api/globalValues';
import {getPackageDetails} from '../../../../../store/selectors/packageDetails';
import {FILE_TYPE_PROCESS, WORKSPACE_PRIVATE, WORKSPACE_PUBLIC} from '../../../../../store/constants/repositories';
import {getTaskAliases} from '../processAliases';

import v1Packages from './v1Packages.json';
import {matchV1Expression, getV1ExpressionParts} from './expression';
import {PROCESS_DATE_FORMAT, PROCESS_NODE_TYPE, USERGROUP_TYPECAST_PATTERN} from './constants';

const IGNORE_EXPRESSION_PARTS = new Set(['{', '}', '[', ']']);

const getDefaultRootNode = () => ({
    uid: generateUUID(),
    packageName: 'AutomationAnywhereWorkflowEvent',
    commandName: PROCESS_NODE_TYPE.ROOT,
    anchor: {
        type: 'STRING',
        string: 'ProcessRequest',
    },
    attributes: [
        {
            name: 'startWith',
            value: {
                type: 'STRING',
                string: 'INPUT_VARIABLES',
            },
        },
        {
            name: 'fileStorage',
            value: {
                type: 'STRING',
                string: 'aari',
            },
        },
        {
            name: 'taskName',
            value: {
                type: 'STRING',
                string: 'Request Creation',
            },
        },
    ],
});

const getDefaultEndNode = () => ({
    uid: generateUUID(),
    packageName: 'AutomationAnywhereWorkflowEvent',
    commandName: PROCESS_NODE_TYPE.END,
    attributes: [
        {
            name: 'status',
            value: {
                type: 'STRING',
                string: 'SUCCESS',
            },
        },
    ],
});

const getTypecaseMethodLookup = (packages) => packages.reduce((methodLookup, pkg) => {
    pkg.commands?.forEach((command) => {
        if (command?.propertyName && command.propertyType && command.propertyReturnType) {
            methodLookup[`${command.propertyType}:${command.propertyReturnType}`] = `.${pkg.name}:${command.propertyName}`;
        }
    });
    methodLookup[`${VALUE_TYPE_DICTIONARY}:${VALUE_TYPE_LIST}`] = '.Dictionary:asList';
    return methodLookup;
}, {});

const getExpressionKey = (key) => REGEX_EXPRESSION_KEY.test(key)
    ? key
    : JSON.stringify(key);

const stripExpressionTypecast = (value) => {
    if (!value?.expression || typeof value.expression !== 'string') {
        return value;
    }
    const strippedExpression = value.expression.replace(USERGROUP_TYPECAST_PATTERN, '$');
    if (strippedExpression === value.expression) {
        return value;
    }
    return {...value, expression: strippedExpression};
};

const getUserGroupValue = (value) => {
    if (!value) {
        return null;
    }
    if (value.expression) {
        return Array.isArray(value.expression)
            ? {type: 'USERGROUP', expression: value.expression.join('')}
            : {type: 'USERGROUP', expression: value.expression};
    }
    if (['TEAM', 'ROLE'].includes(value.userGroup?.type) && Array.isArray(value.userGroup.names)) {
        return {
            type: 'USERGROUP',
            userGroup: {
                type: value.userGroup.type,
                names: value.userGroup.names.filter((name) => typeof name === 'string'),
            },
        };
    }
    return null;
};

const getUserGroupValueWithTypecast = (value) => {
    const typecastMatch = value?.expression?.match(USERGROUP_TYPECAST_PATTERN);
    const groupValue = getUserGroupValue(stripExpressionTypecast(value));
    if (typecastMatch?.[1] && groupValue?.expression) {
        groupValue._preserveTypecast = typecastMatch[1];
    }
    return groupValue;
};

const getV2Expression = (text, globalValues, taskAliases, variables, hasInputVariables) => {
    // global values are simple
    if (text.startsWith('$@')) {
        const globalValueKey = getVariableKey(text.slice(2).replace(/[$]$/, ''));
        const globalValue = globalValues.find((globalValue) => getVariableKey(globalValue.name) === globalValueKey);
        return globalValue?.name
            ? {
                text: `$@${globalValue?.name}$`,
                type: globalValue.type || 'ANY',
            }
            : {
                text,
                type: 'ANY',
            };
    }
    const expressionParts = getV1ExpressionParts(text).filter((part) => !IGNORE_EXPRESSION_PARTS.has(part));
    if (!expressionParts.length) {
        return {
            text,
        };
    }
    let currentVariable = null;
    let currentSchema = null;
    const nextExpression = [];
    const firstPart = expressionParts.at(0);
    let currentType = 'DICTIONARY';
    switch (firstPart) {
        // Request input
        case 'input': {
            expressionParts.shift();
            if (!hasInputVariables) {
                nextExpression.push('&ProcessRequest{input}');
                const taskAlias = taskAliases.find(({name}) => name === 'ProcessRequest');
                currentSchema = taskAlias?.schema?.find(({name}) => name === 'input')?.schema;
                break;
            }
            const variableName = expressionParts.shift();
            nextExpression.push(variableName);
            const variableKey = getVariableKey(variableName);
            const variable = variables.find((variable) => variable.input && getVariableKey(variable.name) === variableKey);
            if (variable?.schema) {
                currentSchema = variable.schema;
            }
            if (variable?.type) {
                currentType = variable.type;
            }
            currentVariable = variable;
            break;
        }
        // Request output
        case 'output': {
            expressionParts.shift();
            const variableName = expressionParts.shift();
            nextExpression.push(variableName);
            const variableKey = getVariableKey(variableName);
            const variable = variables.find((variable) => variable.output && getVariableKey(variable.name) === variableKey);
            if (variable?.schema) {
                currentSchema = variable.schema;
            }
            if (variable?.type) {
                currentType = variable.type;
            }
            currentVariable = variable;
            break;
        }
        default: {
            // Request meta
            if (expressionParts[1] !== '.') {
                const taskAlias = taskAliases.find(({name}) => name === 'ProcessRequest');
                nextExpression.push('&ProcessRequest{meta}');
                currentSchema = taskAlias?.schema?.find(({name}) => name === 'meta')?.schema;
                break;
            }
            // Task alias
            const taskAlias = taskAliases.find(({name}) => name === firstPart);
            // Quote if it doesn't match variable name pattern or contains non-ASCII characters
            const needsQuoting = !REGEX_VARIABLE_NAME.test(firstPart) || /[^ -~]/.test(firstPart);
            const quotedFirstPart = needsQuoting ? JSON.stringify(firstPart) : firstPart;
            nextExpression.push(`&${quotedFirstPart}`);
            expressionParts.shift();
            if (expressionParts.at(0) === '.') {
                expressionParts.shift();
            }
            const section = expressionParts.at(0);
            if (section === 'input' || section === 'output') {
                nextExpression.push(`{${section}}`);
                expressionParts.shift();
                currentSchema = taskAlias?.schema?.find(({name}) => name === section)?.schema;
                break;
            }
            if (section) {
                nextExpression.push('{meta}');
                currentSchema = taskAlias?.schema?.find(({name}) => name === 'meta')?.schema;
            }
            break;
        }
    }
    expressionParts.filter((part) => part !== '.').forEach((part) => {
        let currentSubtype = null;
        let currentEntry = null;
        if (currentVariable) {
            currentSubtype = currentVariable.subtype;
            currentSchema = currentVariable.schema;
            currentVariable = null;
        }
        else if (currentSchema) {
            currentEntry = currentSchema?.find(({name}) => name === part);
        }
        switch (currentType) {
            case 'LIST':
                nextExpression.push(part.startsWith('$')
                    ? `[${getV2Expression(part, globalValues, taskAliases, variables, hasInputVariables).text}]`
                    : `[${part}]`);
                currentType = currentSubtype || 'ANY';
                break;
            case 'TABLE':
                nextExpression.push(part.startsWith('$')
                    ? `[${getV2Expression(part, globalValues, taskAliases, variables, hasInputVariables).text}]`
                    : `[${part}]`);
                currentType = 'RECORD';
                break;
            case 'RECORD':
                if (part.startsWith('$')) {
                    const {text, type} = getV2Expression(part, globalValues, taskAliases, variables, hasInputVariables);
                    nextExpression.push(type === 'NUMBER' ? `[${text}]` : `{${text}}`);
                    currentType = 'ANY';
                    break;
                }
                nextExpression.push(/^[0-9]+$/.test(part)
                    ? `[${part}]`
                    : `{${getExpressionKey(part)}}`,
                );
                currentType = currentEntry?.type || 'ANY';
                break;
            case 'DICTIONARY':
                nextExpression.push(part.startsWith('$')
                    ? `{${getV2Expression(part, globalValues, taskAliases, variables, hasInputVariables).text}}`
                    : `{${getExpressionKey(part)}}`);
                currentType = currentSubtype || 'ANY';
                break;
            default:
                if (part.startsWith('$')) {
                    const {text, type} = getV2Expression(part, globalValues, taskAliases, variables, hasInputVariables);
                    nextExpression.push(type === 'NUMBER' ? `[${text}]` : `{${text}}`);
                    currentType = 'ANY';
                    break;
                }
                nextExpression.push(/^[0-9]+$/.test(part) ? `[${part}]` : `{${getExpressionKey(part)}}`);
                currentType = 'ANY';
                break;
        }
        if (currentEntry?.schema) {
            currentSchema = currentEntry.schema;
        }
        else if (currentEntry) {
            currentType = currentEntry.type;
        }
    });
    return {
        text: `$${nextExpression.join('')}$`,
        type: currentType,
    };
};

const updateExpressionsWithTypecasting = async(file, content) => {
    try {
        const {list: globalValues} = await getGlobalValueListBasic(null);
        const packageDetails = getPackageDetails(v1Packages, file);
        const variableMap = getVariableMap(
            packageDetails.variableGroups,
            packageDetails.variableMap,
            content.variables,
        );
        const taskAliases = getTaskAliases(
            FILE_TYPE_PROCESS,
            content.nodes,
            packageDetails,
            (s) => s,
        );
        const typecastMethodLookup = getTypecaseMethodLookup(v1Packages);
        const getIsToSpecialFormElement = (variable) => {
            switch (variable?.elementType?.toUpperCase()) {
                case 'RADIOBUTTONGROUP':
                case 'DROPDOWN':
                case 'MULTISELECTDROPDOWN':
                case 'CHECKBOXGROUP':
                case 'DATE':
                case 'TIME':
                    break;
                default: return false;
            }
            return true;
        };
        const updateValue = (value, valueType, scope, variable, isFilterExpression) => {
            if (!value || typeof value !== 'object') {
                return;
            }
            if (!value.type) {
                value.type === 'STRING';
            }
            try {
                switch (value?.type) {
                    case 'LIST':
                        if (value.list?.length > 0) {
                            value.list.forEach((value) => updateValue(value));
                            return;
                        }
                        break;
                    case 'DICTIONARY':
                        if (value.dictionary?.length > 0) {
                            const parentValue = value;
                            value.dictionary.forEach(({key, value}) => {
                                let valueType = null;
                                // Goto task overrides
                                if (
                                    scope?.length === 2 &&
                                    scope.at(0)?.name === 'target' &&
                                    scope.at(1)?.key === 'overrides'
                                ) {
                                    const aliasName = scope.at(0).value?.dictionary?.find(({key}) => key === 'name')?.value?.string;
                                    if (aliasName) {
                                        const variableKey = getVariableKey(key);
                                        const variable = taskAliases
                                            .find(({name}) => name === aliasName)?.schema
                                            ?.find(({name}) => name === 'input')?.schema
                                            ?.find(({name}) => getVariableKey(name) === variableKey);
                                        valueType = variable?.type || 'STRING';
                                    }
                                }
                                // Output overrides
                                else if (
                                    scope?.length === 1 &&
                                    (scope.at(0).name === 'startOutputVariables' || scope.at(0).name === 'outputVariables')
                                ) {
                                    const variableKey = getVariableKey(key);
                                    const variable = content.variables
                                        .find(({name, output}) => output && getVariableKey(name) === variableKey);
                                    valueType = variable?.type;
                                }
                                updateValue(value, valueType, scope ? [...scope, {key, parentValue}] : null);
                            });
                            return;
                        }
                        break;
                    case 'RECORD':
                        if (value.record?.values?.length > 0) {
                            value.record.values.forEach((value) => updateValue(value));
                            return;
                        }
                        break;
                    case 'TABLE':
                        if (value.table?.rows?.length > 0) {
                            value.table.rows.forEach((row) => row?.values?.forEach((value) => updateValue(value)));
                            return;
                        }
                        break;
                    case 'AUTOMATION':
                        if (value.automation?.inputVariables || value.automation?.inputOptions) {
                            const variables = value.automation.variables;
                            value.automation.inputVariables?.forEach(({key, value}) => {
                                const variableKey = getVariableKey(key);
                                const variable = variables?.find(({name}) => getVariableKey(name) === variableKey);
                                updateValue(value, variable?.type, null, variable);
                            });
                            value.automation.inputOptions?.forEach(({key, value}) => {
                                const variableKey = getVariableKey(key);
                                const variable = variables?.find(({name}) => getVariableKey(name) === variableKey);
                                updateValue(value, 'LIST', null, variable);
                            });
                            return;
                        }
                        break;
                }
                if (value?.expression && typeof value.expression === 'string') {
                    const toType = valueType || value.type || 'STRING';
                    const lastExpression = value.expression;
                    const nextExpressionParts = [];
                    let lastIndex = 0;
                    let expressionIndex;
                    while ((expressionIndex = lastExpression.indexOf('$', lastIndex)) !== -1) {
                        const match = matchV1Expression(lastExpression.slice(expressionIndex));
                        if (!match) {
                            nextExpressionParts.push(lastExpression.slice(lastIndex, expressionIndex + 1));
                            lastIndex = expressionIndex + 1;
                            continue;
                        }
                        nextExpressionParts.push(lastExpression.slice(lastIndex, expressionIndex));
                        lastIndex = expressionIndex + match[0].length;
                        let expressionText = match[0];
                        expressionText = getV2Expression(
                            expressionText,
                            globalValues,
                            taskAliases,
                            content.variables,
                            Boolean(content.nodes?.at(0)?.attributes?.find(({name}) => name === 'startWith')?.value?.string === 'INPUT_VARIABLES'),
                        ).text;
                        let typecastMethod = null;
                        if (!isFilterExpression) {
                            const {type: fromType} = processExpression(
                                expressionText,
                                toType,
                                globalValues,
                                taskAliases,
                                variableMap,
                                packageDetails.commandMap,
                                packageDetails.commandProperties,
                                (s) => s,
                            );
                            if (fromType === toType || toType === 'ANY' || fromType === 'ANY' || fromType === 'UNDEFINED' || !fromType) {
                                // do nothing
                            }
                            else if (getIsToSpecialFormElement(variable)) {
                                typecastMethod = '.Any:asAny';
                            }
                            else if (fromType === 'DICTIONARY' && toType === 'TABLE') {
                                const toRecord = typecastMethodLookup[`${VALUE_TYPE_DICTIONARY}:${VALUE_TYPE_RECORD}`];
                                const toTable = typecastMethodLookup[`${VALUE_TYPE_RECORD}:${VALUE_TYPE_TABLE}`];
                                if (toRecord && toTable) {
                                    typecastMethod = `${toRecord}${toTable}`;
                                }
                            }
                            else {
                                typecastMethod = typecastMethodLookup[`${fromType}:${toType}`];
                            }
                        }
                        if (typecastMethod) {
                            nextExpressionParts.push(
                                expressionText.slice(0, -1),
                                typecastMethod,
                                '$',
                            );
                        }
                        else {
                            nextExpressionParts.push(expressionText);
                        }
                    }
                    nextExpressionParts.push(lastExpression.slice(lastIndex));
                    value.expression = nextExpressionParts.join('');
                    if (toType !== 'STRING') {
                        value.expression = value.expression.trim();
                    }
                    if (value._preserveTypecast) {
                        value.expression = value.expression.replace(/\$$/, `${value._preserveTypecast}$`);
                        delete value._preserveTypecast;
                    }
                }
            }
            catch (error) {
                crier('error', error);
            }
        };
        const updateAttribute = (attribute, node) => {
            if (!attribute) {
                return;
            }
            if (attribute.value) {
                const isFilterExpression =
                    node?.packageName === 'AutomationAnywhereWorkflowTask' &&
                    node?.commandName === 'Filter' &&
                    attribute.name === 'valueToFilter';
                updateValue(attribute.value, null, [attribute], null, isFilterExpression);
            }
            if (attribute.attributes?.length > 0) {
                attribute.attributes.forEach(updateAttribute);
            }
            if (attribute.groupAttribute) {
                updateAttribute(attribute.groupAttribute);
            }
            if (attribute.operatorAttribute) {
                updateAttribute(attribute.operatorAttribute);
            }
        };
        const updateNode = (node) => node.attributes?.forEach((attribute) => updateAttribute(attribute, node));
        forNodes(content.nodes, updateNode);
        content.orphans?.forEach(({nodes}) => forNodes(nodes, updateNode));
    }
    catch (error) {
        crier('error', error);
    }
};

export const getProcessV2Content = async(workspaceName, file, v1Content) => {
    const content = {
        nodes: [],
        orphans: [],
        swimlanes: [],
        swimlaneStacking: 'LEFT_TO_RIGHT',
        variables: [],
    };
    let formStartVariables = null;
    if (v1Content?.nodes?.length > 0) {
        // Cache repeated lookups
        const automationFileInterfaceMap = new Map();
        const filePaths = new Set();
        const publicFilePaths = new Set();
        const crawlNodesForFilePaths = (nodes) => {
            nodes?.forEach((node) => {
                if (!node) {
                    return;
                }
                if (node?.attributes?.length > 0) {
                    const fileUri =
                        node.attributes.find((attribute) => attribute.name === 'stepInput')?.value?.taskbotFile?.string ||
                        node.attributes.find((attribute) => attribute.name === 'automation')?.value?.automation?.file?.string ||
                        node.attributes.find((attribute) => attribute.name === 'automation')?.value?.automation?.filePath?.string;
                    if (fileUri) {
                        const path = fileUri
                            .replace(/^.+[:]\/\/\//, '')
                            .replace(/[?].+$/, '')
                            .replace(/\//g, '\\')
                            .split('\\')
                            .map((part) => decodeURIComponent(part))
                            .join('\\');
                        filePaths.add(path);
                        if (workspaceName === WORKSPACE_PRIVATE && node.comandName === 'ProcessStep') {
                            publicFilePaths.add(path);
                        }
                    }
                }
                if (node.children?.length > 0) {
                    crawlNodesForFilePaths(node.children);
                }
                if (node.branches?.length > 0) {
                    crawlNodesForFilePaths(node.branches);
                }
            });
        };
        crawlNodesForFilePaths(v1Content.nodes);
        v1Content.orphans?.forEach(({nodes}) => crawlNodesForFilePaths(nodes));
        if (filePaths.size > 0) {
            try {
                const [
                    {list: fileList},
                    {list: publicFileList},
                ] = await Promise.all([
                    getAllFilesList(null, workspaceName, {
                        fields: [],
                        filter: combinePaginationFilters(
                            'or',
                            [...filePaths].map((path) => ({
                                field: 'path',
                                operator: 'eq',
                                value: path,
                            })),
                        ),
                        page: {offset: 0, length: filePaths.size},
                        sort: [{field: 'name', direction: 'asc'}],
                    })
                        .catch(() => ({list: []})),
                    publicFilePaths.size > 0
                        ? getAllFilesList(null, WORKSPACE_PUBLIC, {
                            fields: [],
                            filter: combinePaginationFilters(
                                'or',
                                [...publicFilePaths].map((path) => ({
                                    field: 'path',
                                    operator: 'eq',
                                    value: path,
                                })),
                            ),
                            page: {offset: 0, length: publicFilePaths.size},
                            sort: [{field: 'name', direction: 'asc'}],
                        })
                            .catch(() => ({list: []}))
                        : Promise.resolve({list: []}),
                ]);
                const getFileInterfaces = async(files) => {
                    if (!files.length) {
                        return;
                    }
                    const interfaces = await Promise.all(
                        files.map((file) =>
                            getFileInterface(null, file.id, file.type)
                                .catch(() => null)));
                    files.forEach((file, index) => {
                        let fileInterface = interfaces.at(index);
                        if (fileInterface) {
                            switch (file?.type) {
                                case 'application/vnd.aa.form':
                                    fileInterface = getFormFileInterface(fileInterface);
                                    break;
                                case 'application/vnd.aa.workflow':
                                    fileInterface = getProcessFileInterface(fileInterface);
                                    break;
                            }
                            automationFileInterfaceMap.set(file.path, [file, fileInterface]);
                        }
                    });
                };
                await getFileInterfaces(fileList);
                await getFileInterfaces(publicFileList.filter((file) => !automationFileInterfaceMap.has(file.path)));
            }
            catch (error) {
                // nothing
            }
        }
        const aliasAutomationPathMap = new Map();
        const crawlNodesForAliasPaths = (nodes) => {
            nodes?.forEach((node) => {
                if (!node) {
                    return;
                }
                if (node?.attributes?.length > 0) {
                    const alias =
                        node.attributes.find((attribute) => attribute.name === 'stepAlias')?.value?.string ||
                        node.anchor?.string;
                    if (alias) {
                        const fileUri =
                            node.attributes.find((attribute) => attribute.name === 'stepInput')?.value?.taskbotFile?.string ||
                            node.attributes.find((attribute) => attribute.name === 'automation')?.value?.automation?.file?.string ||
                            node.attributes.find((attribute) => attribute.name === 'automation')?.value?.automation?.filePath?.string;
                        if (fileUri) {
                            const path = fileUri
                                .replace(/^.+[:]\/\/\//, '')
                                .replace(/[?].+$/, '')
                                .replace(/\//g, '\\')
                                .split('\\')
                                .map((part) => decodeURIComponent(part))
                                .join('\\');
                            aliasAutomationPathMap.set(alias, path);
                        }
                    }
                }
                if (node.children?.length > 0) {
                    crawlNodesForAliasPaths(node.children);
                }
                if (node.branches?.length > 0) {
                    crawlNodesForAliasPaths(node.branches);
                }
            });
        };
        crawlNodesForAliasPaths(v1Content.nodes);
        v1Content.orphans?.forEach(({nodes}) => crawlNodesForAliasPaths(nodes));
        const v1NodeMap = new Map();
        const addNodes = (nodes) => {
            nodes?.forEach((node) => v1NodeMap.set(node.uid, node));
        };
        addNodes(v1Content.nodes);
        const convertBusinessAttributes = (value) => {
            if (!value) {
                return;
            }
            const nextValue = {type: 'LIST', list: []};
            if (value?.table?.rows?.length > 0) {
                value.table.rows.forEach((entry) => {
                    if (entry?.values?.length > 0) {
                        const [entryId, entryVisibility, entryValue] = entry.values;
                        const getAttributeValue = () => {
                            const attributeValue = {
                                type: entryValue?.type || 'STRING',
                            };
                            if (entryValue?.expression) {
                                attributeValue.expression = entryValue.expression;
                            }
                            else {
                                switch (attributeValue.type) {
                                    case 'NUMBER':
                                        attributeValue.number = String(entryValue?.number || '');
                                        break;
                                    case 'STRING':
                                        attributeValue.string = entryValue?.string || '';
                                        break;
                                    case 'BOOLEAN':
                                        attributeValue.boolean = entryValue?.boolean === 'TRUE';
                                        break;
                                    case 'DATETIME':
                                        attributeValue.string = entryValue?.string || '';
                                        break;
                                }
                            }
                            return attributeValue;
                        };
                        nextValue.list.push({
                            type: 'DICTIONARY',
                            dictionary: [
                                entryId && {
                                    key: 'label',
                                    value: {type: 'STRING', string: entryId.string?.replaceAll('_', ' ') || ''},
                                },
                                entryVisibility && {
                                    key: 'visibility',
                                    value: {type: 'STRING', string: entryVisibility.string || 'VISIBLE'},
                                },
                                entryValue && {
                                    key: 'type',
                                    value: {type: 'STRING', string: entryValue.type || 'STRING'},
                                },
                                entryValue && {
                                    key: 'value',
                                    value: getAttributeValue(),
                                },
                            ].filter(Boolean),
                        });
                    }
                });
            }
            return nextValue;
        };
        let nodeCount = 0;
        const taskNodeUids = new Set();
        const appendNode = async(v1Node, afterNodesArg) => {
            if (++nodeCount > 50000) {
                // If this happens we are probably stuck in an infinite loop and should throw an error instead of freezing
                throw new Error('Node limit exceeded');
            }
            if (v1Node?.uid) {
                let afterNodes = afterNodesArg;
                const uid = v1Node.uid;
                const getAttributeValue = (v1Attributes, name) => v1Attributes?.find((attribute) => attribute?.name === name)?.value;
                const copyAttributeValue = (v1Attributes, v1Name, attributes, name, callback) => {
                    let value = getAttributeValue(v1Attributes, v1Name);
                    if (callback) {
                        value = callback(value);
                    }
                    if (value) {
                        attributes.push({name, value});
                    }
                };
                const copyFixedDateTimeAttributeValue = (v1Attributes, v1Name, attributes, name) => {
                    const value = getAttributeValue(v1Attributes, v1Name);
                    if (value?.string) {
                        // Strip timezone information if present (e.g., [America/Los_Angeles])
                        const dateString = value.string.replace(/\[.*?\]$/, '');
                        let date = moment(dateString, PROCESS_DATE_FORMAT, true);
                        if (!date.isValid()) {
                            date = moment(dateString);
                        }
                        if (date.isValid()) {
                            attributes.push({name, value: {type: 'DATETIME', string: date.toISOString()}});
                        }
                    }
                };
                const copyAttributeAutomation = async(v1Attributes, v1Name, attributes, name) => {
                    const automationUri = getAttributeValue(v1Attributes, 'stepInput')?.taskbotFile?.string;
                    if (automationUri) {
                        const automation = {
                            file: {type: 'FILE', string: automationUri},
                            variables: [],
                            inputVariables: [],
                            inputOptions: [],
                            inputData: [],
                            previewData: [],
                        };
                        attributes.push({
                            name,
                            value: {
                                type: 'AUTOMATION',
                                automation,
                            },
                        });
                        const automationInputValues = new Map();
                        const automationInputs = getAttributeValue(v1Attributes, 'stepInput')?.taskbotInput?.dictionary;
                        if (automationInputs?.length > 0) {
                            automationInputs.forEach((entry) => {
                                if (entry?.value) {
                                    const key = getVariableKey(entry.key);
                                    automationInputValues.set(key, entry.value);
                                }

                            });
                        }
                        let file;
                        let fileInterface;
                        try {
                            const path = automationUri
                                .replace(/^.+[:]\/\/\//, '')
                                .replace(/[?].+$/, '')
                                .replace(/\//g, '\\')
                                .split('\\')
                                .map((part) => decodeURIComponent(part))
                                .join('\\');
                            [file, fileInterface] = automationFileInterfaceMap.get(path) ?? [];
                        }
                        catch (error) {
                            error;
                        }
                        switch (file?.type) {
                            case 'application/vnd.aa.workflow':
                            case 'application/vnd.aa.aiagent':
                            case 'application/vnd.aa.taskbot':
                            case 'application/vnd.aa.headlessbot':
                            case 'application/vnd.aa.prompt':
                                if (fileInterface?.variables?.length > 0) {
                                    fileInterface.variables.forEach((variable) => {
                                        if (variable?.name) {
                                            const key = getVariableKey(variable.name);
                                            const value = automationInputValues.get(key);
                                            automation.variables.push(variable);
                                            if (value) {
                                                automation.inputVariables.push({
                                                    key: variable.name,
                                                    value,
                                                });
                                            }
                                        }
                                    });
                                }
                                break;
                            case 'application/vnd.aa.form': {
                                if (fileInterface?.variables?.length > 0) {
                                    fileInterface.variables.forEach((variable) => {
                                        if (variable?.name) {
                                            const key = getVariableKey(variable.name);
                                            let value = automationInputValues.get(key);
                                            automation.variables.push(variable);
                                            if (value) {
                                                switch (variable.type) {
                                                    case 'FILE':
                                                        if (value.type !== 'FILE') {
                                                            value = value.string
                                                                ? {
                                                                    type: 'FILE',
                                                                    string: getFileUri(value.string),
                                                                }
                                                                : value.expression
                                                                    ? {
                                                                        type: 'FILE',
                                                                        expression: value.expression,
                                                                    }
                                                                    : null;
                                                        }
                                                        break;
                                                }
                                                if (value) {
                                                    automation.inputVariables.push({
                                                        key: variable.name,
                                                        value,
                                                    });
                                                }
                                            }
                                        }
                                    });
                                }
                                break;
                            }
                        }
                    }
                };
                const copyAttributeConditional = (v1Attributes, v1Name, attributes, name) => {
                    const v1Attribute = v1Attributes?.find((attribute) => attribute?.name === v1Name);
                    if (!v1Attribute?.value) {
                        return false;
                    }
                    const attribute = {name, value: {type: 'CONDITIONAL', packageName: 'AutomationAnywhereWorkflowLogic'}, attributes: []};
                    switch (`${v1Attribute.value?.packageName}#${v1Attribute.value?.conditionalName}`) {
                        case 'String#stringVariable': {
                            attribute.value.conditionalName = 'String';
                            copyAttributeValue(v1Attribute.attributes, 'operator', attribute.attributes, 'operator', (value) => {
                                return {type: 'STRING', string: value?.string || 'EQ'};
                            });
                            copyAttributeValue(v1Attribute.attributes, 'variable', attribute.attributes, 'source');
                            copyAttributeValue(v1Attribute.attributes, 'value', attribute.attributes, 'target');
                            copyAttributeValue(v1Attribute.attributes, 'isMatch', attribute.attributes, 'caseSensitive');
                            break;
                        }
                        case 'Number#numberVariable': {
                            attribute.value.conditionalName = 'Number';
                            copyAttributeValue(v1Attribute.attributes, 'operator', attribute.attributes, 'operator', (value) => {
                                return {type: 'STRING', string: value?.string || 'EQ'};
                            });
                            copyAttributeValue(v1Attribute.attributes, 'variable', attribute.attributes, 'source');
                            copyAttributeValue(v1Attribute.attributes, 'value', attribute.attributes, 'target');
                            break;
                        }
                        case 'Boolean#booleanVariable': {
                            attribute.value.conditionalName = 'Boolean';
                            copyAttributeValue(v1Attribute.attributes, 'operator', attribute.attributes, 'operator', (value) => {
                                return {type: 'STRING', string: value?.string || 'EQ'};
                            });
                            copyAttributeValue(v1Attribute.attributes, 'variable', attribute.attributes, 'source');
                            copyAttributeValue(v1Attribute.attributes, 'value', attribute.attributes, 'target');
                            break;
                        }
                        case 'Datetime#dateVariable': {
                            attribute.value.conditionalName = 'Datetime';
                            copyAttributeValue(v1Attribute.attributes, 'operator', attribute.attributes, 'operator', (value) => {
                                return {type: 'STRING', string: value?.string || 'EQ'};
                            });
                            const sourceType = getAttributeValue(v1Attribute.attributes, 'sourceDateOption')?.string;
                            switch (sourceType) {
                                case 'DATETIME':
                                    copyAttributeValue(v1Attribute.attributes, 'sourceDateTime', attribute.attributes, 'source');
                                    break;
                                case 'FIXED VALUE':
                                    copyFixedDateTimeAttributeValue(v1Attribute.attributes, 'sourceFixedDate', attribute.attributes, 'source');
                                    break;
                            }
                            const targetType = getAttributeValue(v1Attribute.attributes, 'destDateOption')?.string;
                            switch (targetType) {
                                case 'DATETIME':
                                    copyAttributeValue(v1Attribute.attributes, 'destDateTime', attribute.attributes, 'target');
                                    break;
                                case 'FIXED VALUE':
                                    copyFixedDateTimeAttributeValue(v1Attribute.attributes, 'destFixedDate', attribute.attributes, 'target');
                                    break;
                            }
                            break;
                        }
                    }
                    if (v1Attribute.operatorAttribute) {
                        const array = [];
                        copyAttributeConditional([v1Attribute.operatorAttribute], 'condition', array, 'condition');
                        if (array.at(0)) {
                            attribute.operatorAttribute = array.at(0);
                            attribute.operatorAttribute.operator = v1Attribute.operatorAttribute.operator || 'AND';
                        }
                    }
                    attributes.push(attribute);
                    return true;
                };
                const processAttributeValue = (v1Attributes, v1Name, callback) => {
                    const value = getAttributeValue(v1Attributes, v1Name);
                    callback(value);
                };
                const v1NodeName = `${v1Node.packageName}#${v1Node.commandName}`;
                switch (v1NodeName) {
                    case 'HBCWorkflow#InitialStep': {
                        const node = {
                            uid,
                            packageName: 'AutomationAnywhereWorkflowEvent',
                            commandName: 'Root',
                            anchor: {type: 'STRING', string: 'ProcessRequest'},
                            attributes: [],
                            layout: v1Node.layout,
                        };
                        const initMethod = getAttributeValue(v1Node.attributes, 'initMethod')?.string;
                        switch (initMethod) {
                            case 'INIT_BY_INPUT': {
                                node.attributes.push({
                                    name: 'startWith',
                                    value: {
                                        type: 'STRING',
                                        string: 'INPUT_VARIABLES',
                                    },
                                });
                                break;
                            }
                            default:
                            case 'INIT_BY_FORM': {
                                formStartVariables = [];
                                node.attributes.push({
                                    name: 'startWith',
                                    value: {
                                        type: 'STRING',
                                        string: 'FORM',
                                    },
                                });
                                await copyAttributeAutomation(v1Node.attributes, 'stepInput', node.attributes, 'automation');
                                const automationAttribute = node.attributes.find((attribute) => attribute.name === 'automation');
                                if (automationAttribute?.value?.automation?.inputVariables && v1Content?.variables?.length > 0) {
                                    v1Content.variables.forEach((v1Variable) => {
                                        if (v1Variable?.name && v1Variable.input) {
                                            formStartVariables.push(v1Variable.name);
                                        }
                                    });
                                }
                                break;
                            }
                        }
                        copyAttributeValue(v1Node.attributes, 'caseTitle', node.attributes, 'requestTitle');
                        copyAttributeValue(v1Node.attributes, 'stepTitle', node.attributes, 'taskName', (value) => {
                            const defaultValue = {type: 'STRING', string: 'Request Creation'};
                            return value ?? defaultValue;
                        });
                        copyAttributeValue(v1Node.attributes, 'piiTag', node.attributes, 'piiTag');
                        node.attributes.push({
                            name: 'fileStorage',
                            value: {type: 'STRING', string: getAttributeValue(v1Node.attributes, 'aaFileStorage')?.string === 'iqbot' ? 'iqbot' : 'aari'},
                        });
                        copyAttributeValue(v1Node.attributes, 'requestAttributes', node.attributes, 'requestAttributes', convertBusinessAttributes);
                        const variablesWithDefaultValueOverride = v1Content?.variables?.filter((variable) =>
                            variable.output && variable.defaultValue?.expression);
                        if (variablesWithDefaultValueOverride?.length > 0) {
                            node.attributes.push({
                                name: 'startOutputVariables',
                                value: {
                                    type: 'DICTIONARY',
                                    dictionary: variablesWithDefaultValueOverride.map((variable) => ({
                                        key: variable.name,
                                        value: variable.defaultValue,
                                    })),
                                },
                            });
                        }
                        afterNodes.push(node);
                        break;
                    }
                    case 'HBCWorkflow#ProcessStep':
                    case 'HBCWorkflow#Agent':
                    case 'HBCWorkflow#BotStep':
                    case 'HBCWorkflow#ApiBotStep':
                    case 'HBCWorkflow#FormStep':
                    case 'HBCWorkflow#ApprovalStep':
                    case 'HBCWorkflow#IFrameStep':
                    case 'HBCWorkflow#DocumentExtractionStep': {
                        const node = {
                            uid,
                            packageName: 'AutomationAnywhereWorkflowTask',
                            attributes: [],
                            layout: v1Node.layout,
                        };
                        const anchorName = getAttributeValue(v1Node.attributes, 'stepAlias')?.string;
                        if (anchorName) {
                            node.anchor = {type: 'STRING', string: anchorName};
                        }
                        copyAttributeValue(v1Node.attributes, 'stepTitle', node.attributes, 'taskName');
                        copyAttributeValue(v1Node.attributes, 'piiTag', node.attributes, 'piiTag');
                        switch (v1NodeName) {
                            case 'HBCWorkflow#ProcessStep':
                            case 'HBCWorkflow#Agent':
                            case 'HBCWorkflow#BotStep':
                            case 'HBCWorkflow#ApiBotStep':
                            case 'HBCWorkflow#DocumentExtractionStep': {
                                copyAttributeValue(v1Node.attributes, 'hidden', node.attributes, 'hideTask');
                                switch (v1NodeName) {
                                    case 'HBCWorkflow#ProcessStep': {
                                        node.commandName = 'Process';
                                        copyAttributeValue(v1Node.attributes, 'assignedToGroup', node.attributes, 'targetUsers', getUserGroupValueWithTypecast);
                                        copyAttributeValue(v1Node.attributes, 'processId', node.attributes, 'workspaceName', (value) => value?.string
                                            ? {type: 'STRING', string: 'PRIVATE'}
                                            : {type: 'STRING', string: 'PUBLIC'});
                                        await copyAttributeAutomation(v1Node.attributes, 'stepInput', node.attributes, 'automation');
                                        break;
                                    }
                                    case 'HBCWorkflow#Agent': {
                                        node.commandName = 'Agent';
                                        copyAttributeValue(v1Node.attributes, 'assignedToGroup', node.attributes, 'targetUsers', getUserGroupValueWithTypecast);
                                        copyAttributeValue(v1Node.attributes, 'processId', node.attributes, 'workspaceName', (value) => value?.string
                                            ? {type: 'STRING', string: 'PRIVATE'}
                                            : {type: 'STRING', string: 'PUBLIC'});
                                        const isWorkspacePublic = node.attributes.find((attribute) => attribute.name === 'workspaceName')?.value?.string === 'PUBLIC';
                                        await copyAttributeAutomation(v1Node.attributes, 'stepInput', node.attributes, 'automation', isWorkspacePublic);
                                        break;
                                    }
                                    case 'HBCWorkflow#BotStep': {
                                        node.commandName = 'Bot';
                                        node.attributes.push({
                                            name: 'executionMode',
                                            value: {
                                                type: 'STRING',
                                                string: !getAttributeValue(v1Node.attributes, 'allowLocalRun')?.boolean
                                                    ? 'REMOTE'
                                                    : !getAttributeValue(v1Node.attributes, 'runInChildWindow')?.boolean
                                                        ? 'LOCAL_MAIN'
                                                        : 'LOCAL_CHILD',
                                            },
                                        });

                                        await copyAttributeAutomation(v1Node.attributes, 'stepInput', node.attributes, 'automation');

                                        // Get the timeout
                                        const timeoutHoursValue = getAttributeValue(v1Node.attributes, 'taskExpirationHours');
                                        const timeoutMinutesValue = getAttributeValue(v1Node.attributes, 'taskExpirationMinutes');
                                        if (timeoutHoursValue || timeoutMinutesValue) {
                                            const seconds =
                                                (parseInt(timeoutHoursValue?.string, 10) || 0) * 3600 +
                                                (parseInt(timeoutMinutesValue?.string, 10) || 0) * 60;
                                            node.attributes.push({
                                                name: 'queueTimeout',
                                                value: {
                                                    type: 'DURATION',
                                                    string: new Duration(seconds).toString(),
                                                },
                                            });
                                        }
                                        else {
                                            node.attributes.push({
                                                name: 'queueTimeout',
                                                value: {
                                                    type: 'DURATION',
                                                    string: new Duration(86400).toString(),
                                                },
                                            });
                                        }
                                        break;
                                    }
                                    case 'HBCWorkflow#ApiBotStep':
                                        node.commandName = 'Api';
                                        await copyAttributeAutomation(v1Node.attributes, 'stepInput', node.attributes, 'automation');
                                        break;
                                    case 'HBCWorkflow#DocumentExtractionStep':
                                        node.commandName = 'DocumentExtraction';
                                        await copyAttributeAutomation(v1Node.attributes, 'stepInput', node.attributes, 'automation');
                                        copyAttributeValue(v1Node.attributes, 'sub_type', node.attributes, 'subType', (value) => {
                                            return {type: 'STRING', string: value?.string};
                                        });

                                        if (getAttributeValue(v1Node.attributes, 'sub_type')?.string === 'CLOUD_EXTRACTION') {
                                            copyAttributeValue(v1Node.attributes, 'stepInput', node.attributes, 'inputFilePath', (value) => value?.taskbotInput?.dictionary?.find((entry) => entry.key === 'InputFilePath')?.value);
                                            copyAttributeValue(v1Node.attributes, 'stepInput', node.attributes, 'learningInstanceName', (value) => value?.taskbotInput?.dictionary?.find((entry) => entry.key === 'LearningInstanceName')?.value);
                                            copyAttributeValue(v1Node.attributes, 'stepInput', node.attributes, 'learningInstanceVersion', (value) => value?.taskbotInput?.dictionary?.find((entry) => entry.key === 'Version')?.value);
                                            copyAttributeValue(v1Node.attributes, 'stepInput', node.attributes, 'packageVersion', (value) => value?.taskbotInput?.dictionary?.find((entry) => entry.key === 'PackageVersion')?.value);
                                        }
                                        else {
                                            node.attributes.push({
                                                name: 'executionMode',
                                                value: {
                                                    type: 'STRING',
                                                    string: !getAttributeValue(v1Node.attributes, 'allowLocalRun')?.boolean
                                                        ? 'REMOTE'
                                                        : !getAttributeValue(v1Node.attributes, 'runInChildWindow')?.boolean
                                                            ? 'LOCAL_MAIN'
                                                            : 'LOCAL_CHILD',
                                                },
                                            });
                                            // Get the timeout
                                            const timeoutHoursValue = getAttributeValue(v1Node.attributes, 'taskExpirationHours');
                                            const timeoutMinutesValue = getAttributeValue(v1Node.attributes, 'taskExpirationMinutes');
                                            if (timeoutHoursValue || timeoutMinutesValue) {
                                                const seconds =
                                                    (parseInt(timeoutHoursValue?.string, 10) || 0) * 3600 +
                                                    (parseInt(timeoutMinutesValue?.string, 10) || 0) * 60;
                                                node.attributes.push({
                                                    name: 'queueTimeout',
                                                    value: {
                                                        type: 'DURATION',
                                                        string: new Duration(seconds).toString(),
                                                    },
                                                });
                                            }
                                            else {
                                                node.attributes.push({
                                                    name: 'queueTimeout',
                                                    value: {
                                                        type: 'DURATION',
                                                        string: new Duration(86400).toString(),
                                                    },
                                                });
                                            }
                                        }
                                        break;
                                }
                                break;
                            }
                            case 'HBCWorkflow#FormStep':
                            case 'HBCWorkflow#ApprovalStep':
                            case 'HBCWorkflow#IFrameStep': {
                                switch (v1NodeName) {
                                    case 'HBCWorkflow#FormStep':
                                        node.commandName = 'Form';
                                        break;
                                    case 'HBCWorkflow#ApprovalStep':
                                        node.commandName = 'Approval';
                                        break;
                                    case 'HBCWorkflow#IFrameStep':
                                        node.commandName = 'DocumentValidation';
                                        break;
                                }
                                const formModeValue = {type: 'STRING', string: 'INTERACTIVE'};
                                node.attributes.push({name: 'formMode', value: formModeValue});
                                copyAttributeValue(v1Node.attributes, 'readOnly', node.attributes, 'readOnly', (value) => {
                                    if (!value) {
                                        return;
                                    }
                                    if (String(value.boolean) === 'true') {
                                        formModeValue.string = 'READONLY';
                                    }
                                });
                                const taskRequesterAndAssignmentValue = {type: 'STRING', string: 'DEFAULT'};
                                node.attributes.push({name: 'taskRequesterAndAssignment', value: taskRequesterAndAssignmentValue});
                                copyAttributeValue(v1Node.attributes, 'createdByGroup', node.attributes, 'taskRequester', (value) => {
                                    const nextValue = {type: 'STRING', string: 'CREATOR'};
                                    if (!value) {
                                        return;
                                    }

                                    taskRequesterAndAssignmentValue.string = 'CUSTOM';
                                    if (value?.expression === '$createdByUser$') {
                                        nextValue.string = 'CREATOR';
                                    }
                                    else if (value?.expression === '$assignedToGroup$') {
                                        nextValue.string = 'ASSIGNED_GROUP';
                                    }
                                    else {
                                        nextValue.string = 'CUSTOM';
                                        node.attributes.push({name: 'taskRequesterGroup', value: getUserGroupValueWithTypecast(value)});
                                    }
                                    return nextValue;
                                });
                                copyAttributeValue(v1Node.attributes, 'assignedToGroup', node.attributes, 'taskAssignment', (value) => {
                                    const nextValue = {type: 'STRING', string: 'CREATOR'};
                                    if (!value) {
                                        return;
                                    }

                                    taskRequesterAndAssignmentValue.string = 'CUSTOM';
                                    if (value?.expression === '$createdByUser$') {
                                        nextValue.string = 'CREATOR';
                                    }
                                    else if (value?.expression === '$assignedToGroup$') {
                                        nextValue.string = 'ASSIGNED_GROUP';
                                    }
                                    else if (value) {
                                        nextValue.string = 'CUSTOM';
                                        node.attributes.push({name: 'taskAssignmentGroup', value: getUserGroupValueWithTypecast(value)});
                                    }
                                    return nextValue;
                                });
                                copyAttributeValue(v1Node.attributes, 'showInRequested', node.attributes, 'taskShowInRequested');
                                copyAttributeValue(v1Node.attributes, 'hidden', node.attributes, 'hideTask');
                                copyAttributeValue(v1Node.attributes, 'autoAssign', node.attributes, 'taskContributor', (value) => ({type: 'STRING', string: value?.string || 'MANUAL'}));
                                copyAttributeValue(v1Node.attributes, 'autoAssignUser', node.attributes, 'autoAssignUser');
                                copyAttributeValue(v1Node.attributes, 'stepAttributes', node.attributes, 'stepAttributes', convertBusinessAttributes);
                                copyAttributeValue(v1Node.attributes, 'taskExpirationTime', node.attributes, 'taskExpirationTime', (value) => {
                                    const nextValue = {type: 'STRING', string: 'NONE'};
                                    switch (value?.string?.toUpperCase()) {
                                        case '1HOUR':
                                            nextValue.string = '1HOUR';
                                            break;
                                        case '1DAY':
                                            nextValue.string = '1DAY';
                                            break;
                                        case '1WEEK':
                                            nextValue.string = '1WEEK';
                                            break;
                                        case '2WEEKS':
                                            nextValue.string = '2WEEKS';
                                            break;
                                        case '30DAYS':
                                            nextValue.string = '30DAYS';
                                            break;
                                        case 'CUSTOM': {
                                            nextValue.string = 'CUSTOM';
                                            // Get the timeout
                                            const timeoutDaysValue = getAttributeValue(v1Node.attributes, 'taskExpirationDays');
                                            const timeoutHoursValue = getAttributeValue(v1Node.attributes, 'taskExpirationHours');
                                            const timeoutMinutesValue = getAttributeValue(v1Node.attributes, 'taskExpirationMinutes');
                                            if (timeoutDaysValue || timeoutHoursValue || timeoutMinutesValue) {
                                                const seconds =
                                                    (parseInt(timeoutDaysValue?.string, 10) || 0) * 86400 +
                                                    (parseInt(timeoutHoursValue?.string, 10) || 0) * 3600 +
                                                    (parseInt(timeoutMinutesValue?.string, 10) || 0) * 60;
                                                node.attributes.push({
                                                    name: 'taskExpirationTimeCustom',
                                                    value: {
                                                        type: 'DURATION',
                                                        string: new Duration(seconds).toString(),
                                                    },
                                                });
                                            }
                                            else {
                                                node.attributes.push({
                                                    name: 'taskExpirationTimeCustom',
                                                    value: {
                                                        type: 'DURATION',
                                                        string: new Duration(3888000).toString(),
                                                    },
                                                });
                                            }
                                            break;
                                        }
                                    }
                                    return nextValue;
                                });
                                if (v1NodeName !== 'HBCWorkflow#IFrameStep') {
                                    await copyAttributeAutomation(v1Node.attributes, 'stepInput', node.attributes, 'automation');
                                }
                                switch (v1NodeName) {
                                    case 'HBCWorkflow#FormStep':
                                        copyAttributeValue(v1Node.attributes, 'formButtons', node.attributes, 'formButtons', (value) => {
                                            const nextValue = {type: 'LIST', list: []};
                                            if (value?.dictionary?.length > 0) {
                                                value.dictionary.forEach((entry) => {

                                                    const typeValue = {type: 'STRING', string: 'PRIMARY'};
                                                    switch (entry.value?.string) {
                                                        case 'primary':
                                                            typeValue.string = 'PRIMARY';
                                                            break;
                                                        case 'secondary':
                                                            typeValue.string = 'SECONDARY';
                                                            break;
                                                        case 'cancel':
                                                            typeValue.string = 'CANCEL';
                                                            break;
                                                    }

                                                    nextValue.list.push({
                                                        type: 'DICTIONARY',
                                                        dictionary: [
                                                            {key: 'type', value: typeValue},
                                                            {
                                                                key: 'label',
                                                                value: {
                                                                    type: 'STRING',
                                                                    string: (entry.key ?? '').trim(),
                                                                },
                                                            },
                                                        ],
                                                    });
                                                });
                                            }
                                            return nextValue;
                                        });
                                        break;
                                    case 'HBCWorkflow#ApprovalStep':
                                        copyAttributeValue(v1Node.attributes, 'noOfApproval', node.attributes, 'requiredApprovalCount', (value) => {
                                            return {type: 'NUMBER', number: String(value?.string || 1)};
                                        });
                                        processAttributeValue(v1Node.attributes, 'formButtonV2', (value) => {
                                            const approveButtonLabelValue = {type: 'STRING', string: 'APPROVE'};
                                            const approveButtonDictionary = value?.table?.rows?.at(0)?.values?.at(0)?.dictionary;
                                            node.attributes.push({name: 'approveButtonLabel', value: approveButtonLabelValue});
                                            if (approveButtonDictionary?.length > 0) {
                                                const standardLabel = approveButtonDictionary.find((entry) => entry.key === 'standard_label');
                                                if (standardLabel?.value?.string) {
                                                    approveButtonLabelValue.string = standardLabel.value.string;
                                                }
                                                else {
                                                    const customLabel = approveButtonDictionary.find((entry) => entry.key === 'custom_label');
                                                    if (customLabel) {
                                                        approveButtonLabelValue.string = 'CUSTOM';
                                                        if (customLabel?.value?.string) {
                                                            node.attributes.push({name: 'approveButtonCustomLabel', value: {type: 'STRING', string: customLabel.value.string}});
                                                        }
                                                    }
                                                }
                                            }
                                            const declineButtonLabelValue = {type: 'STRING', string: 'DECLINE'};
                                            const declineButtonDictionary = value?.table?.rows?.at(0)?.values?.at(1)?.dictionary;
                                            node.attributes.push({name: 'declineButtonLabel', value: declineButtonLabelValue});
                                            if (declineButtonDictionary?.length > 0) {
                                                const standardLabel = declineButtonDictionary.find((entry) => entry.key === 'standard_label');
                                                if (standardLabel?.value?.string) {
                                                    declineButtonLabelValue.string = standardLabel.value.string;
                                                }
                                                else {
                                                    const customLabel = declineButtonDictionary.find((entry) => entry.key === 'custom_label');
                                                    if (customLabel) {
                                                        declineButtonLabelValue.string = 'CUSTOM';
                                                        if (customLabel?.value?.string) {
                                                            node.attributes.push({name: 'declineButtonCustomLabel', value: {type: 'STRING', string: customLabel.value.string}});
                                                        }
                                                    }
                                                }
                                            }
                                        });
                                        break;
                                    case 'HBCWorkflow#IFrameStep':
                                        copyAttributeValue(v1Node.attributes, 'stepInput', node.attributes, 'documentId', (value) => value?.taskbotInput?.dictionary?.find((entry) => entry.key === 'documentId')?.value);
                                        copyAttributeValue(v1Node.attributes, 'stepInput', node.attributes, 'version', (value) => value?.taskbotInput?.dictionary?.find((entry) => entry.key === 'version')?.value);
                                }
                                switch (v1NodeName) {
                                    case 'HBCWorkflow#FormStep':
                                    case 'HBCWorkflow#ApprovalStep': {
                                        const automationValue = node.attributes.find(({name}) => name === 'automation')?.value?.automation;
                                        if (!automationValue?.variables?.length) {
                                            break;
                                        }
                                        const variableNames = new Set();
                                        const inputOptionsEntries = v1Node.attributes
                                            ?.find(({name}) => name === 'dynamicFormSchema')
                                            ?.value
                                            ?.dictionary;
                                        const inputOptionsMap = (inputOptionsEntries || []).reduce((result, entry) => {
                                            if (entry?.key) {
                                                variableNames.add(entry.key);
                                                if (entry.value) {
                                                    result.set(entry.key, entry.value);
                                                }
                                            }
                                            return result;
                                        }, new Map());
                                        const variableMap = automationValue.variables.reduce((result, variable) => {
                                            result.set(variable.name, variable);
                                            return result;
                                        }, new Map());
                                        const inputEntryMap = (automationValue.inputVariables || []).reduce((result, inputEntry) => {
                                            result.set(inputEntry.key, inputEntry);
                                            variableNames.add(inputEntry.key);
                                            return result;
                                        }, new Map());
                                        automationValue.inputVariables = [];
                                        automationValue.inputOptions = [];
                                        [...variableNames].forEach((key) => {
                                            const variable = variableMap.get(key);
                                            if (!variable?.name) {
                                                return;
                                            }
                                            const inputOptionsValue = inputOptionsMap.get(key);
                                            const nextOptionsEntry = {key};
                                            if (inputOptionsValue) {
                                                if (inputOptionsValue.list?.length >= 0) {
                                                    nextOptionsEntry.value = {
                                                        type: 'LIST',
                                                        list: inputOptionsValue.list.map((value) => ({
                                                            ...value,
                                                            type: 'STRING',
                                                        })),
                                                    };
                                                }
                                                else if (inputOptionsValue.expression) {
                                                    const parts = inputOptionsValue.expression.split(',');
                                                    if (parts.length > 1 || inputOptionsValue.type === 'STRING' || inputOptionsValue.type === '') {
                                                        nextOptionsEntry.value = {
                                                            type: 'LIST',
                                                            list: parts.map((part) => ({
                                                                type: 'STRING',
                                                                [part.includes('$') ? 'expression' : 'string']: part,
                                                            })),
                                                        };
                                                    }
                                                    else {
                                                        nextOptionsEntry.value = {
                                                            type: 'LIST',
                                                            expression: inputOptionsValue.expression,
                                                        };
                                                    }
                                                }
                                                else if (inputOptionsValue.string) {
                                                    const parts = inputOptionsValue.string.split(',');
                                                    nextOptionsEntry.value = {
                                                        type: 'LIST',
                                                        list: parts.map((part) => ({
                                                            type: 'STRING',
                                                            string: part,
                                                        })),
                                                    };
                                                }
                                                automationValue.inputOptions.push(nextOptionsEntry);
                                            }
                                            const inputEntry = inputEntryMap.get(key);
                                            const nextEntry = {key};
                                            switch (variable.elementType?.toUpperCase()) {
                                                case 'RADIOBUTTONGROUP':
                                                case 'DROPDOWN':
                                                    nextEntry.value = {type: 'STRING'};
                                                    if (inputEntry?.value?.string) {
                                                        nextEntry.value.string = inputEntry.value.string;
                                                    }
                                                    else if (inputEntry?.value?.expression) {
                                                        nextEntry.value.expression = inputEntry.value.expression;
                                                    }
                                                    else {
                                                        nextEntry.value.string = '';
                                                    }
                                                    automationValue.inputVariables.push(nextEntry);
                                                    break;
                                                case 'MULTISELECTDROPDOWN':
                                                    if (inputEntry?.value) {
                                                        nextEntry.value = {type: 'LIST'};
                                                        if (inputEntry.value.list?.length > 0) {
                                                            nextEntry.value.list = inputEntry.value.list.map((value) => ({
                                                                ...value,
                                                                type: 'STRING',
                                                            }));
                                                        }
                                                        else if (inputEntry.value.expression) {
                                                            const parts = inputEntry.value.expression.split(',');
                                                            if (parts.length > 1) {
                                                                nextEntry.value.list = parts.map((part) => ({
                                                                    type: 'STRING',
                                                                    [part.startsWith('$') ? 'expression' : 'string']: part,
                                                                }));
                                                            }
                                                            else {
                                                                nextEntry.value.expression = inputEntry.value.expression;
                                                            }
                                                        }
                                                        else if (inputEntry.value.string) {
                                                            const parts = inputEntry.value.string.split(',');
                                                            nextEntry.value.list = parts.map((part) => ({
                                                                type: 'STRING',
                                                                string: part,
                                                            }));
                                                        }
                                                        else {
                                                            nextEntry.value.list = [];
                                                        }
                                                        automationValue.inputVariables.push(nextEntry);
                                                    }
                                                    break;
                                                case 'CHECKBOXGROUP':
                                                    if (inputEntry?.value) {
                                                        nextEntry.value = {type: 'DICTIONARY'};
                                                        if (inputEntry.value.list?.length > 0) {
                                                            nextEntry.value.dictionary = inputEntry.value.list
                                                                .map((value) => {
                                                                    if (!value?.string) {
                                                                        return null;
                                                                    }

                                                                    if (inputOptionsValue?.list?.length > 0) {
                                                                        return {
                                                                            key: value.string,
                                                                            value: {type: 'BOOLEAN', boolean: true},
                                                                        };
                                                                    }

                                                                    return {
                                                                        key: value.string,
                                                                        value: {type: 'BOOLEAN', boolean: false},
                                                                    };
                                                                })
                                                                .filter(Boolean);
                                                        }
                                                        else if (inputEntry.value.expression) {
                                                            nextEntry.value.expression = inputEntry.value.expression;
                                                        }
                                                        else if (inputEntry.value.string) {
                                                            const parts = inputEntry.value.string.split(',');
                                                            nextEntry.value.dictionary = parts.map((part) => ({
                                                                key: part,
                                                                value: {type: 'BOOLEAN', boolean: true},
                                                            }));
                                                        }
                                                        else {
                                                            nextEntry.value.dictionary = [];
                                                        }
                                                        automationValue.inputVariables.push(nextEntry);
                                                    }
                                                    break;
                                                case 'DATE':
                                                    if (inputEntry.value?.string) {
                                                        automationValue.inputVariables.push({
                                                            key: inputEntry.key,
                                                            value: {
                                                                type: 'DATETIME',
                                                                string: inputEntry.value?.string,
                                                            },
                                                        });
                                                    }
                                                    else if (inputEntry.value?.expression) {
                                                        automationValue.inputVariables.push({
                                                            key: inputEntry.key,
                                                            value: {
                                                                type: 'DATETIME',
                                                                expression: inputEntry.value.expression,
                                                            },
                                                        });
                                                    }
                                                    break;
                                                case 'TIME':
                                                    if (inputEntry.value?.string) {
                                                        automationValue.inputVariables.push({
                                                            key: inputEntry.key,
                                                            value: {
                                                                type: 'DATETIME',
                                                                string: inputEntry.value?.string,
                                                            },
                                                        });
                                                    }
                                                    else if (inputEntry.value?.expression) {
                                                        automationValue.inputVariables.push({
                                                            key: inputEntry.key,
                                                            value: {
                                                                type: 'DATETIME',
                                                                expression: inputEntry.value.expression,
                                                            },
                                                        });
                                                    }
                                                    break;
                                                default:
                                                    if (inputEntry) {
                                                        automationValue.inputVariables.push(inputEntry);
                                                    }
                                            }
                                        });
                                        break;
                                    }
                                }
                                break;
                            }
                        }
                        afterNodes.push(node);
                        taskNodeUids.add(node.uid);
                        break;
                    }
                    case 'If#if':
                    case 'If#elseIf':
                    case 'If#else': {
                        const node = {
                            uid,
                            packageName: 'AutomationAnywhereWorkflowLogic',
                            commandName: 'If',
                            attributes: [],
                            branches: [],
                            children: [],
                            layout: v1Node.layout,
                        };
                        switch (v1NodeName) {
                            case 'If#if':
                                node.commandName = 'If';
                                break;
                            case 'If#elseIf':
                                node.commandName = 'ElseIf';
                                break;
                            case 'If#else':
                                node.commandName = 'Else';
                                break;
                        }
                        copyAttributeValue(v1Node.attributes, 'stepTitle', node.attributes, 'requestTitle');
                        copyAttributeValue(v1Node.attributes, 'stepStatus', node.attributes, 'message');
                        switch (v1NodeName) {
                            case 'If#if':
                            case 'If#elseIf': {
                                copyAttributeValue(v1Node.attributes, 'stepAlias', node.attributes, 'description');
                                copyAttributeConditional(v1Node.attributes, 'condition', node.attributes, 'conditional');
                                copyAttributeValue(v1Node.children?.at(0).attributes, 'requestAttributes', node.attributes, 'requestAttributes', convertBusinessAttributes);
                                break;
                            }
                            case 'If#else': {
                                copyAttributeValue(v1Node.children?.at(0).attributes, 'requestAttributes', node.attributes, 'requestAttributes', convertBusinessAttributes);
                                break;
                            }
                        }
                        if (v1Node.branches?.length > 0) {
                            await asyncForEach(v1Node.branches, async(branch) => {
                                await appendNode(branch, node.branches);
                            });
                        }
                        afterNodes.push(node);
                        afterNodes = node.children;
                        break;
                    }
                    case 'HBCWorkflow#exit': {
                        const node = {
                            uid,
                            packageName: 'AutomationAnywhereWorkflowEvent',
                            commandName: 'End',
                            attributes: [],
                            layout: v1Node.layout,
                        };
                        const endType = getAttributeValue(v1Node.attributes, 'caseExit')?.string;
                        switch (endType) {
                            default:
                            case 'SUCCESS':
                                node.attributes.push({
                                    name: 'status',
                                    value: {type: 'STRING', string: 'SUCCESS'},
                                });
                                break;
                            case 'CANCELLED':
                                node.attributes.push({
                                    name: 'status',
                                    value: {type: 'STRING', string: 'CANCEL'},
                                });
                                break;
                            case 'ERROR':
                            case 'FAIL':
                                node.attributes.push({
                                    name: 'status',
                                    value: {type: 'STRING', string: 'FAIL'},
                                });
                                break;
                        }
                        copyAttributeValue(v1Node.attributes, 'caseTitle', node.attributes, 'requestTitle');
                        copyAttributeValue(v1Node.attributes, 'caseStatus', node.attributes, 'message');
                        copyAttributeValue(v1Node.attributes, 'caseOutput', node.attributes, 'outputVariables', (value) => {
                            if (value?.type === 'DICTIONARY' && value.dictionary?.length > 0) {
                                return {
                                    type: 'DICTIONARY',
                                    dictionary: value?.dictionary.map((entry) => {
                                        return {
                                            key: entry.key,
                                            value: entry.value,
                                        };
                                    }),
                                };
                            }
                            return value;
                        });
                        afterNodes.push(node);
                        return;
                    }
                    case 'HBCWorkflow#StreamStep': {
                        const node = {
                            uid,
                            packageName: 'AutomationAnywhereWorkflowTask',
                            commandName: 'Filter',
                            attributes: [],
                            layout: v1Node.layout,
                        };
                        const anchorName = getAttributeValue(v1Node.attributes, 'stepAlias')?.string;
                        if (anchorName) {
                            node.anchor = {type: 'STRING', string: anchorName};
                        }
                        copyAttributeValue(v1Node.attributes, 'stepTitle', node.attributes, 'taskName');
                        copyAttributeValue(v1Node.attributes, 'hidden', node.attributes, 'hideTask');
                        copyAttributeValue(v1Node.attributes, 'value', node.attributes, 'valueToFilter', (value) => {
                            if (value) {
                                return {
                                    type: 'ANY',
                                    expression: value.expression || '',
                                    expressionType: (value.expression ? value.type || 'STRING' : '') || '',
                                };
                            }
                        });
                        copyAttributeValue(v1Node.attributes, 'iteration_type', node.attributes, 'filterType', (value) => {
                            const expressionType = getAttributeValue(v1Node.attributes, 'value')?.type;
                            if (expressionType) {
                                const iterationType = value?.string;
                                let filterTypeString;
                                switch (expressionType) {
                                    case 'ANY':
                                    case 'STRING':
                                    case 'NUMBER':
                                    case 'BOOLEAN':
                                    case 'DATETIME':
                                    case 'FILE':
                                    case 'WINDOW':
                                        filterTypeString = expressionType;
                                        break;
                                    case 'LIST':
                                        filterTypeString = iterationType === 'ELEMENT'
                                            ? 'LIST_ENTRY'
                                            : 'LIST';
                                        break;
                                    case 'DICTIONARY':
                                        filterTypeString = iterationType === 'ELEMENT'
                                            ? 'DICTIONARY_ENTRY'
                                            : 'DICTIONARY';
                                        break;
                                    case 'RECORD':
                                        filterTypeString = iterationType === 'VALUE'
                                            ? 'RECORD'
                                            : 'RECORD_ENTRY';
                                        break;
                                    case 'TABLE':
                                        filterTypeString = iterationType === 'ELEMENT'
                                            ? 'TABLE_ROW'
                                            : iterationType === 'SCHEMA'
                                                ? 'TABLE_COLUMN'
                                                : 'TABLE';
                                        break;
                                }
                                if (!filterTypeString) {
                                    return;
                                }
                                return {type: 'STRING', string: filterTypeString};
                            }
                        });
                        const found = copyAttributeConditional(v1Node.attributes, 'filter', node.attributes, 'conditional');
                        if (!found) {
                            copyAttributeConditional(v1Node.attributes, 'condition', node.attributes, 'conditional');
                        }
                        afterNodes.push(node);
                        taskNodeUids.add(node.uid);
                        break;
                    }
                    default:
                        return;
                }
                const v1ChildNode = v1Node.children?.at(0)?.commandName === 'bizattribute' ? v1Node.children.at(1) : v1Node.children.at(0);
                if (v1ChildNode) {
                    switch (`${v1ChildNode.packageName}#${v1ChildNode.commandName}`) {
                        case 'HBCWorkflow#schedule': {
                            const nextNodeUid = v1ChildNode?.attributes?.find((attribute) => attribute.name === 'stepId')?.value?.string;
                            if (v1ChildNode.editorMetadata?.isGoto || taskNodeUids.has(nextNodeUid)) {
                                const node = {
                                    uid: v1ChildNode.uid,
                                    packageName: 'AutomationAnywhereWorkflowEvent',
                                    commandName: 'Goto',
                                    attributes: [
                                        {
                                            name: 'status',
                                            value: {type: 'STRING', string: 'GOTO'},
                                        },
                                    ],
                                    layout: v1ChildNode.layout,
                                };
                                if (nextNodeUid) {
                                    const nextNodeAnchorLabel = v1NodeMap.get(nextNodeUid)?.attributes?.find((attribute) => attribute?.name === 'stepAlias')?.value?.string;
                                    const aliasFilePath = aliasAutomationPathMap.get(nextNodeAnchorLabel);
                                    const [file, fileInterface] = automationFileInterfaceMap.get(aliasFilePath) || [];
                                    const aliasFileInterface = file && fileInterface ? fileInterface : null;
                                    const aliasVariableMap = new Map();
                                    aliasFileInterface?.variables?.forEach((variable) => {
                                        if (variable?.name) {
                                            aliasVariableMap.set(getVariableKey(variable.name), variable);
                                        }
                                    });
                                    const overrides = v1ChildNode?.attributes?.find(({name}) => name === 'stepOverride')?.value;
                                    const overrideEntries = [];
                                    const optionsEntries = [];
                                    const typeEntries = [...aliasVariableMap.values()].map((variable) => {
                                        return {
                                            key: variable.name,
                                            value: {type: 'STRING', string: variable.type || 'STRING'},
                                        };
                                    });
                                    const elementTypeEntries = [...aliasVariableMap.values()].map((variable) => {
                                        if (!variable?.elementType) {
                                            return;
                                        }
                                        return {
                                            key: variable.name,
                                            value: {type: 'STRING', string: variable.elementType},
                                        };
                                    }).filter(Boolean);
                                    if (overrides?.dictionary?.length > 0) {
                                        const variableNames = new Set();
                                        const inputOptionsEntries = v1ChildNode.attributes
                                            ?.find(({name}) => name === 'dynamicFormSchema')
                                            ?.value
                                            ?.dictionary;
                                        const inputOptionsMap = (inputOptionsEntries || []).reduce((result, entry) => {
                                            const options = entry?.value?.list?.length > 0
                                                ? {
                                                    type: 'LIST',
                                                    list:  entry.value.list,
                                                }
                                                : entry?.value?.expression
                                                    ? entry?.value?.expression.includes(',')
                                                        ? {
                                                            type: 'LIST',
                                                            list: entry.value.expression
                                                                .split(/\s*[,]\s*/)
                                                                .map((string) => string.includes('$')
                                                                    ? {type: 'STRING', expression: string}
                                                                    : {type: 'STRING', string}),
                                                        }
                                                        : {
                                                            type: 'LIST',
                                                            expression: entry.value.expression,
                                                        }
                                                    : null;
                                            variableNames.add(entry.key);
                                            if (options) {
                                                result.set(entry.key, options);
                                            }
                                            return result;
                                        }, new Map());
                                        const inputEntryMap = overrides.dictionary.reduce((result, entry) => {
                                            result.set(entry.key, entry);
                                            variableNames.add(entry.key);
                                            return result;
                                        }, new Map());
                                        [...variableNames].forEach((key) => {
                                            const variableKey = getVariableKey(key);
                                            const variable = aliasVariableMap.get(variableKey);
                                            const inputEntry = inputEntryMap.get(key);
                                            const nextEntry = {
                                                key,
                                                value: {type: 'STRING'},
                                            };
                                            if (inputEntry) {
                                                switch (variable?.elementType?.toUpperCase()) {
                                                    case 'DATE':
                                                    case 'TIME':
                                                        if (inputEntry.value?.expression) {
                                                            nextEntry.value = {
                                                                type: 'DATETIME',
                                                                expression: inputEntry.value.expression,
                                                            };
                                                        }
                                                        else {
                                                            nextEntry.value = {
                                                                type: 'DATETIME',
                                                                string: inputEntry.value?.string || '',
                                                            };
                                                        }
                                                        break;
                                                    case 'MULTISELECTDROPDOWN':
                                                        if (inputEntry.value?.expression) {
                                                            nextEntry.value = {
                                                                type: 'LIST',
                                                                expression: inputEntry.value.expression,
                                                            };
                                                        }
                                                        else {
                                                            nextEntry.value = {
                                                                type: 'LIST',
                                                                list: inputEntry.value?.list || [],
                                                            };
                                                        }
                                                        break;
                                                    case 'CHECKBOXGROUP':
                                                        if (inputEntry.value?.expression) {
                                                            nextEntry.value = {
                                                                type: 'DICTIONARY',
                                                                expression: inputEntry.value.expression,
                                                            };
                                                        }
                                                        else {
                                                            nextEntry.value = {
                                                                type: 'DICTIONARY',
                                                                dictionary: inputEntry.value?.dictionary || [],
                                                            };
                                                        }
                                                        break;
                                                    default:
                                                        nextEntry.value = inputEntry.value;
                                                        break;
                                                }
                                            }
                                            const inputOptions = inputOptionsMap.get(key);
                                            if (inputOptions) {
                                                optionsEntries.push({
                                                    key,
                                                    value: inputOptions,
                                                });
                                            }
                                            if (nextEntry) {
                                                overrideEntries.push(nextEntry);
                                            }
                                        });
                                        node.attributes.push({
                                            name: 'target',
                                            value: {
                                                type: 'DICTIONARY',
                                                dictionary: [
                                                    {key: 'name', value: {type: 'STRING', string: nextNodeAnchorLabel}},
                                                    overrideEntries.length > 0 && {
                                                        key: 'overrides',
                                                        value: {
                                                            type: 'DICTIONARY',
                                                            dictionary: overrideEntries,
                                                        },
                                                    },
                                                    optionsEntries.length > 0 && {
                                                        key: 'options',
                                                        value: {
                                                            type: 'DICTIONARY',
                                                            dictionary: optionsEntries,
                                                        },
                                                    },
                                                    typeEntries.length > 0 && {
                                                        key: 'types',
                                                        value: {
                                                            type: 'DICTIONARY',
                                                            dictionary: typeEntries,
                                                        },
                                                    },
                                                    elementTypeEntries.length > 0 && {
                                                        key: 'elementTypes',
                                                        value: {
                                                            type: 'DICTIONARY',
                                                            dictionary: elementTypeEntries,
                                                        },
                                                    },
                                                ].filter(Boolean),
                                            },
                                        });
                                    }
                                    else {
                                        node.attributes.push({
                                            name: 'target',
                                            value: {type: 'STRING', string: nextNodeAnchorLabel},
                                        });
                                    }
                                }
                                afterNodes.push(node);
                                break;
                            }

                            if (nextNodeUid) {
                                await appendNode(v1NodeMap.get(nextNodeUid), afterNodes);
                            }
                            break;
                        }
                        case 'If#if':
                        case 'HBCWorkflow#exit':
                            await appendNode(v1ChildNode, afterNodes);
                            break;
                    }
                }
            }
        };
        await appendNode(v1Content.nodes.at(0), content.nodes);
    }
    if (v1Content?.variables?.length > 0) {
        const getVariableDefaultValue = (type, defaultValue) => {
            if (!defaultValue || defaultValue.expression) {
                return null;
            }
            switch (type) {
                case 'RECORD':
                    if (defaultValue.schema?.schema?.length > 0 && defaultValue.schema?.values?.length > 0) {
                        return {type: 'RECORD', record: defaultValue.schema};
                    }
                    break;
            }
            return defaultValue;
        };
        content.variables = v1Content.variables.reduce((result, v1Variable) => {
            if (v1Variable?.name && !(formStartVariables && v1Variable.input)) {
                const variableType = v1Variable.type || 'STRING';
                const v2Variable = {
                    name: v1Variable.name,
                    type: variableType,
                    subtype: v1Variable.subType,
                    description: v1Variable.description,
                    input: Boolean(v1Variable.input),
                    inputRequired: Boolean(v1Variable.inputRequired),
                    output: Boolean(v1Variable.output),
                    readOnly: Boolean(v1Variable.readOnly),
                    defaultValue: getVariableDefaultValue(variableType, v1Variable.defaultValue),
                };
                result.push(v2Variable);
            }
            return result;
        }, []);
    }
    // add default start & end nodes if process is empty
    if (!content?.nodes?.length) {
        content.nodes = [
            getDefaultRootNode(),
            getDefaultEndNode(),
        ];
    }
    else {
        const firstNode = content.nodes.at(0);
        if (!(firstNode.commandName === PROCESS_NODE_TYPE.ROOT && firstNode.packageName === 'AutomationAnywhereWorkflowEvent')) {
            content.nodes.unshift(getDefaultRootNode());
        }
    }
    if (v1Content.isProcessV2) {
        content.orphans = v1Content.orphans ?? [];
        content.swimlanes = v1Content.swimlanes ?? [];
        content.swimlaneStacking = v1Content.swimlaneStacking ?? 'LEFT_TO_RIGHT';
    }
    else {
        const result = getAutoLayout({
            nodes: content.nodes,
        });
        const layoutMap = new Map();
        result.nodes.forEach((node) => {
            layoutMap.set(node.id, node.position);
        });
        result.edges.forEach((edge) => {
            const layout = layoutMap.get(edge?.target);
            if (layout) {
                layoutMap.set(edge.target, {
                    ...layout,
                    incomingEdgeSourceHandle: edge.sourceHandle,
                    incomingEdgeSelfHandle: edge.targetHandle,
                });
            }
        });
        forNodes(content.nodes, (node) => {
            node.layout = layoutMap.get(node?.uid) ?? {};
        });
        content.orphans = [];
        content.swimlanes = [];
        content.swimlaneStacking = 'LEFT_TO_RIGHT';
    }
    await updateExpressionsWithTypecasting(file, content);
    return content;
};

