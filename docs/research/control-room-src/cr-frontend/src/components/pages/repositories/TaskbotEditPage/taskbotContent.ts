/**
 * Copyright (c) 2023 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import {
    Duration,
} from '@automationanywhere/rio-components';
import type {
    AutomationNodeType,
    AutomationAttributeType,
    AutomationCommandNodeType,
    AutomationTriggerNodeType,
    AutomationContentType,
    AutomationVariableType,
    AutomationPackageType,
    AutomationUIObjectValueType,
    AutomationUIObjectValueAnchorType,
    AutomationUIObjectValueCriteriaEntryType,
    AutomationVariableValueType,
    AutomationValueType,
    AutomationIteratorValueType,
    AutomationConditionalValueType,
    AutomationRegionValueType,
    AutomationCaptureType,
    AutomationCoordinateValueType,
    AutomationImageValueType,
    AutomationConditionalAttributeType,
    AutomationBasicAttributeType,
    AutomationTriggerAttributeType,
    AutomationTaskContentPropertiesType,
    PackageDetailsCommandType,
    PackageDetailsTriggerType,
    PackageDetailsType,
    PackageVersionType,
    FileProtobufType,
    AutomationElementNodeType,
    AutomationProcessContentOrphansType,
    AutomationSwimLaneNodeType,
    AutomationSchemaEntryType,
    AutomationStringLiteralValueType,
    AutomationElementNodeLayoutType,
    AutomationSwimLaneNodeLayoutType,
    AutomationProcessContentType,
    AutomationProcessContentPropertiesType,
    AutomationProcessTriggerNodeType,
    AutomationTaskContentType,
} from '@automationanywhere/rio-components';
import {
    VALUE_TYPE_ITERATOR,
    VALUE_TYPE_CONDITIONAL,
    VALUE_TYPE_VARIABLE,
    VALUE_TYPE_UIOBJECT,
    VALUE_TYPE_UNDEFINED,
    VALUE_TYPE_STRING,
    VALUE_TYPE_COORDINATE,
    VALUE_TYPE_REGION,
    VALUE_TYPE_IMAGE,
    PACKAGE_ATTRIBUTE_TYPE_ANCHOR,
} from '@automationanywhere/rio-components/src/editor';
import {VALUE_TYPE_DICTIONARY} from '@automationanywhere/rio-components/src/editor/constants/values';
import type {AutomationDictionaryLiteralValueType} from '@automationanywhere/rio-components/src/types/editor/AutomationValueType';

import {setNodeAttributes} from '../../../editor/utils/nodeDetails';
import {getPackageConditionalKey, getPackageIteratorKey, getPackageVariableKey, NODE_TYPE_TRIGGER} from '../../../editor/utils/nodes';
import {getPackageSettingsAttributes} from '../../../../store/selectors/packageAttributes';
import {getAutomationTypeIsProcess} from '../../../../store/selectors/taskbotFeatures';

type AutomationValueTypeWithUndefinedType = AutomationValueType['type'] | 'UNDEFINED';

type GetTaskbotContentArgumentType = {
    automationType: string;
    values: {
        triggers: AutomationTriggerNodeType[];
        nodes: (AutomationElementNodeType | AutomationCommandNodeType)[];
        orphans: AutomationProcessContentOrphansType[];
        swimlanes?: AutomationSwimLaneNodeType[];
        swimlaneStacking?: AutomationProcessContentType['swimlaneStacking'];
        variables: AutomationVariableType[];
        packages: AutomationPackageType[];
        packageSettings: Record<string, AutomationAttributeType[]>;
        workItemTemplateName?: string;
        properties: AutomationTaskContentPropertiesType | AutomationProcessContentPropertiesType;
    };
    packageVersions: PackageVersionType[];
    packageDetails: PackageDetailsType;
    usedPackageSet: Set<string>;
    fileInterfaceMap: Record<string, FileProtobufType>;
    taskAliases?: AutomationSchemaEntryType[];
    featureFlags: Set<string>;
    licenseFlags: Set<string>;
    hasFeatureProcessEditorV2Save?: boolean;
    hasFeatureProcessEditorV1FallbackSave?: boolean;
};

type GetTaskbotContentReturnType = {
    hasErrors: Boolean;
    content: AutomationContentType;
};

type HasCaptureType = {
    capture: AutomationCaptureType;
};

type HasCriteriaType = {
    criteria: Record<string, AutomationUIObjectValueCriteriaEntryType>;
};

const getObjectWithCapture = <T>(object: T): T => {
    const objectWithCapture = object as HasCaptureType;
    if (!objectWithCapture?.capture?.securelyRecorded) {
        return object;
    }
    return {
        ...object,
        capture: {
            securelyRecorded: true,
        },
    };
};

const getObjectWithCriteria = <T>(object: T):T => {
    const objectWithCriteria = object as HasCriteriaType;
    if (!objectWithCriteria?.criteria) {
        return object;
    }
    return {
        ...object,
        criteria: [
            ...Object.entries(objectWithCriteria.criteria)]
            .reduce<Record<string, AutomationUIObjectValueCriteriaEntryType>>((
                result,
                [name, entry]: [string, AutomationUIObjectValueCriteriaEntryType],
            ) => {
                const nextEntry = {enabled: Boolean(entry.enabled)} as AutomationUIObjectValueCriteriaEntryType;
                if (!entry?.securelyRecordedRemoveDisabled || nextEntry.enabled) {
                    nextEntry.value = entry.value;
                }
                if (!nextEntry.value) {
                    nextEntry.value = {type: VALUE_TYPE_STRING, string: ''};
                }
                result[name] = nextEntry;
                return result;
            }, {}),
    };
};

const normalizeLayoutNumber = <KeyType extends string>(value: Record<KeyType, number>, key: KeyType) => {
    if (typeof value[key] === 'number') {
        value[key] = Math.floor(value[key]) || 0;
    }
    else if (key in value) {
        delete value[key];
    }
};

/**
 * Gets the normalized content and if there are any structural errors
 */
export const getTaskbotContent = (
    {
        automationType,
        values,
        packageVersions,
        packageDetails,
        usedPackageSet,
        fileInterfaceMap,
        taskAliases,
        featureFlags,
        licenseFlags,
        hasFeatureProcessEditorV2Save,
        hasFeatureProcessEditorV1FallbackSave,
    }: GetTaskbotContentArgumentType,
): GetTaskbotContentReturnType => {
    let hasErrors = false;
    const processAttributes = (
        attributes: AutomationAttributeType[],
        definition?: PackageDetailsCommandType,
    ):AutomationAttributeType[] => attributes.reduce((result, lastAttribute) => {
        if (!lastAttribute) {
            return result;
        }
        const {value: lastValue, ...nextAttribute} = lastAttribute;
        if (lastValue) {
            const nextValue = {...lastValue} as AutomationValueType;
            switch (nextValue.type) {
                case VALUE_TYPE_VARIABLE: {
                    const nextTypedValue = nextValue as AutomationVariableValueType;
                    if (nextTypedValue.packageName) {
                        const variable = packageDetails.variableMap[getPackageVariableKey(nextTypedValue)];
                        if (variable) {
                            nextTypedValue.packageName = variable.packageName;
                        }
                    }
                    break;
                }
                case VALUE_TYPE_ITERATOR: {
                    const nextTypedValue = nextValue as AutomationIteratorValueType;
                    const iterator = packageDetails.iteratorMap[getPackageIteratorKey(nextTypedValue)];
                    if (iterator) {
                        nextTypedValue.iteratorName = iterator.name;
                        nextTypedValue.packageName = iterator.packageName;
                    }
                    break;
                }
                case VALUE_TYPE_CONDITIONAL: {
                    const nextTypedValue = nextValue as AutomationConditionalValueType;
                    const conditional = packageDetails.conditionalMap[getPackageConditionalKey(nextTypedValue)];
                    if (conditional) {
                        nextTypedValue.conditionalName = conditional.name;
                        nextTypedValue.packageName = conditional.packageName;
                    }
                    break;
                }
                case VALUE_TYPE_REGION: {
                    const nextTypedValue = nextValue as AutomationRegionValueType;
                    nextTypedValue.region = getObjectWithCapture<AutomationRegionValueType['region']>(nextTypedValue.region);
                    break;
                }
                case VALUE_TYPE_COORDINATE: {
                    const nextTypedValue = nextValue as AutomationCoordinateValueType;
                    nextTypedValue.coordinate = getObjectWithCapture<AutomationCoordinateValueType['coordinate']>(nextTypedValue.coordinate);
                    break;
                }
                case VALUE_TYPE_IMAGE: {
                    const nextTypedValue = nextValue as AutomationImageValueType;
                    if (nextTypedValue?.unsavedSecurelyRecorded) {
                        nextTypedValue.securelyRecorded = true;
                        delete nextTypedValue.unsavedSecurelyRecorded;
                    }
                    break;
                }
                case VALUE_TYPE_UIOBJECT: {
                    const nextTypedValue = nextValue as AutomationUIObjectValueType;
                    if (nextTypedValue.uiObject) {
                        nextTypedValue.uiObject = getObjectWithCapture<AutomationUIObjectValueType['uiObject']>(nextTypedValue.uiObject);
                        nextTypedValue.uiObject = getObjectWithCriteria<AutomationUIObjectValueType['uiObject']>(nextTypedValue.uiObject);
                    }
                    if (nextTypedValue.uiObjectAnchor?.uiObject) {
                        nextTypedValue.uiObjectAnchor = {...nextTypedValue.uiObjectAnchor} as AutomationUIObjectValueAnchorType;
                        nextTypedValue.uiObjectAnchor.uiObject = getObjectWithCapture<AutomationUIObjectValueAnchorType['uiObject']>(nextTypedValue.uiObjectAnchor.uiObject);
                        nextTypedValue.uiObjectAnchor.uiObject = getObjectWithCriteria<AutomationUIObjectValueAnchorType['uiObject']>(nextTypedValue.uiObjectAnchor.uiObject);
                    }
                    break;
                }
                case VALUE_TYPE_DICTIONARY: {
                    const nextTypedValue = nextValue as AutomationDictionaryLiteralValueType;
                    if (nextTypedValue.dictionary?.length > 0) {
                        const attributeDefinition = definition?.attributes?.find(({name}) => lastAttribute.name === name);
                        if (attributeDefinition?.type === PACKAGE_ATTRIBUTE_TYPE_ANCHOR && taskAliases?.length > 0) {
                            const nameValue = nextTypedValue.dictionary.find(({key}) => key === 'name')?.value as AutomationStringLiteralValueType;
                            if (nameValue?.string) {
                                const taskAlias = taskAliases.find((entry) => entry.name === nameValue.string) as AutomationSchemaEntryType & {inputOverride?: boolean};
                                let validNameSet = new Set();
                                if (taskAlias?.inputOverride) {
                                    const taskAliasInputSchema = taskAlias.schema?.find((entry) => entry.name === 'input')?.schema;
                                    if (taskAliasInputSchema?.length > 0) {
                                        validNameSet = new Set(taskAliasInputSchema.map((entry) => entry.name));
                                    }
                                }
                                const overrideEntries = nextTypedValue.dictionary.find(({key}) => key === 'overrides')?.value as AutomationDictionaryLiteralValueType;
                                const optionsEntries = nextTypedValue.dictionary.find(({key}) => key === 'options')?.value as AutomationDictionaryLiteralValueType;
                                const typeEntries = nextTypedValue.dictionary.find(({key}) => key === 'types')?.value as AutomationDictionaryLiteralValueType;
                                const elementTypeEntries = nextTypedValue.dictionary.find(({key}) => key === 'elementTypes')?.value as AutomationDictionaryLiteralValueType;
                                nextTypedValue.dictionary = [
                                    {key: 'name', value: nameValue},
                                    overrideEntries?.dictionary?.length > 0 && {
                                        key: 'overrides',
                                        value: {
                                            type: 'DICTIONARY',
                                            dictionary: overrideEntries.dictionary.filter(({key}) => {
                                                return validNameSet.has(key);
                                            }),
                                        },
                                    },
                                    optionsEntries?.dictionary?.length > 0 && {
                                        key: 'options',
                                        value: {
                                            type: 'DICTIONARY',
                                            dictionary: optionsEntries.dictionary.filter(({key}) => {
                                                return validNameSet.has(key);
                                            }),
                                        },
                                    },
                                    typeEntries?.dictionary?.length > 0 && {
                                        key: 'types',
                                        value: {
                                            type: 'DICTIONARY',
                                            dictionary: typeEntries.dictionary.filter(({key}) => {
                                                return validNameSet.has(key);
                                            }),
                                        },
                                    },
                                    elementTypeEntries?.dictionary?.length > 0 && {
                                        key: 'elementTypes',
                                        value: {
                                            type: 'DICTIONARY',
                                            dictionary: elementTypeEntries.dictionary.filter(({key}) => {
                                                return validNameSet.has(key);
                                            }),
                                        },
                                    },
                                ].filter(Boolean) as AutomationDictionaryLiteralValueType['dictionary'];
                            }
                        }
                    }
                }
            }
            const nextTypedAttribute = nextAttribute as AutomationBasicAttributeType;
            nextTypedAttribute.value = nextValue;
        }
        if ('attributes' in nextAttribute) {
            const nextTypedAttribute = nextAttribute as AutomationTriggerAttributeType;
            if (nextTypedAttribute.attributes) {
                nextTypedAttribute.attributes = processAttributes(nextAttribute.attributes);
            }
        }
        if ('groupAttribute' in nextAttribute) {
            const nextTypedAttribute = nextAttribute as AutomationConditionalAttributeType;
            if (nextTypedAttribute.groupAttribute) {
                nextTypedAttribute.groupAttribute = processAttributes([nextAttribute.groupAttribute]).at(0);
            }
        }
        if ('operatorAttribute' in nextAttribute) {
            const nextTypedAttribute = nextAttribute as AutomationConditionalAttributeType;
            if (nextTypedAttribute.operatorAttribute) {
                nextTypedAttribute.operatorAttribute = processAttributes([nextAttribute.operatorAttribute]).at(0);
            }
        }

        result.push(nextAttribute);
        return result;
    }, []);
    const processNodes = <NodeType extends AutomationCommandNodeType | AutomationTriggerNodeType, DefinitionType extends PackageDetailsCommandType | PackageDetailsTriggerType>(
        nodes: NodeType[],
        definitionMap: Record<string, DefinitionType>,
        definitionNameKey: 'commandName' | 'triggerName',
    ): NodeType[] => {
        if (!nodes) {
            return [];
        }
        return nodes.reduce((result, genericNode) => {
            const node = genericNode as AutomationCommandNodeType;
            if (!node) {
                return result;
            }

            if (!node.uid) {
                hasErrors = true;
                result.push(node);
                return result;
            }

            const definition = definitionMap[
                `${node.packageName}#${node[definitionNameKey as keyof AutomationNodeType]}`.toLowerCase()
            ] as PackageDetailsCommandType;
            if (!definition) {
                hasErrors = true;
                result.push(node);
                return result;
            }

            const nextNode = {uid: node.uid} as AutomationCommandNodeType;
            if ((node as AutomationElementNodeType).layout) {
                const layout: AutomationElementNodeLayoutType = {...(node as AutomationElementNodeType).layout};
                normalizeLayoutNumber(layout, 'x');
                normalizeLayoutNumber(layout, 'y');
                (nextNode as AutomationElementNodeType).layout = layout;
            }

            nextNode[definitionNameKey as 'commandName'] = definition.name;
            nextNode.packageName = definition.packageName;
            switch (definitionNameKey) {
                case 'commandName': {
                    if (definition.nestable) {
                        nextNode.children = processNodes<AutomationCommandNodeType, PackageDetailsCommandType>(
                            node.children as AutomationCommandNodeType[],
                            definitionMap,
                            definitionNameKey,
                        );
                    }
                    if (definition.branchable) {
                        nextNode.branches = processNodes<AutomationCommandNodeType, PackageDetailsCommandType>(
                            node.branches as AutomationCommandNodeType[],
                            definitionMap,
                            definitionNameKey,
                        );
                    }
                    if (definition.anchor && node.anchor) {
                        nextNode.anchor = node.anchor;
                    }
                    nextNode.disabled = Boolean(node.disabled);
                    break;
                }
                case 'triggerName': {
                    const triggerDefinition = definition as PackageDetailsTriggerType;
                    const triggerNode = node as unknown as AutomationTriggerNodeType;
                    const nextTriggerNode = nextNode as unknown as AutomationTriggerNodeType;
                    if (triggerDefinition.triggerType) {
                        nextTriggerNode.triggerType = triggerDefinition.triggerType;
                    }
                    nextTriggerNode.disabled = Boolean(triggerNode.disabled);
                    // Process triggers have anchor
                    const nodeWithAnchor = node as unknown as AutomationProcessTriggerNodeType;
                    if ('anchor' in node && nodeWithAnchor.anchor) {
                        (nextTriggerNode as unknown as AutomationProcessTriggerNodeType).anchor = nodeWithAnchor.anchor;
                    }
                    break;
                }
            }
            if (definition.attributes?.length > 0 && node.attributes) {
                nextNode.attributes = processAttributes(node.attributes, definition);
            }
            if (definition.returns?.length > 0) {
                if (node.returns && Object.keys(node.returns).length > 0) {
                    nextNode.returns = node.returns;
                }
            }
            else if (definition.returnType && (definition.returnType as AutomationValueTypeWithUndefinedType) !== VALUE_TYPE_UNDEFINED) {
                if (node.returnTo) {
                    nextNode.returnTo = node.returnTo;
                }
            }
            result.push(nextNode);
            return result;
        }, []);
    };
    const processVariables = (variables: AutomationVariableType[]): AutomationVariableType[] => variables.map(({key, ...variable}) => variable); //eslint-disable-line no-unused-vars
    const processPackages = (formPackages: AutomationPackageType[]): AutomationPackageType[] => {
        if (!packageVersions?.length) {
            return [];
        }

        const nameSet = new Set();
        const result: AutomationPackageType[] = [];
        packageVersions.forEach((pkg) => {
            if (!nameSet.has(pkg.name) && usedPackageSet.has(pkg.name)) {
                nameSet.add(pkg.name);
                if (getAutomationTypeIsProcess(automationType)) {
                    const {processCodeVersion} = values.properties as AutomationProcessContentPropertiesType;
                    if (['0', '1'].includes(processCodeVersion)) {
                        result.push({
                            name: pkg.name,
                            version: '*',
                        });
                        return;
                    }
                }
                const settingsAttributes: AutomationAttributeType[] = [];
                const packageSettingsAttributes = getPackageSettingsAttributes(pkg.settingsAttributes, featureFlags, licenseFlags);
                if (packageSettingsAttributes.length > 0) {
                    setNodeAttributes(
                        NODE_TYPE_TRIGGER,
                        settingsAttributes,
                        values.packageSettings,
                        packageSettingsAttributes,
                        packageDetails.iteratorMap,
                        packageDetails.conditionalMap,
                        packageDetails.triggerMap,
                        packageDetails.exceptionMap,
                        values.variables,
                        fileInterfaceMap,
                        pkg.name,
                    );
                }
                result.push({
                    name: pkg.name,
                    version: pkg.packageVersion,
                    settingsAttributes,
                });
            }
        });
        formPackages.forEach((pkg) => {
            if (!nameSet.has(pkg.name) && usedPackageSet.has(pkg.name)) {
                result.push({
                    name: pkg.name,
                    version: pkg.version,
                    settingsAttributes: [],
                });
                nameSet.add(pkg.name);
            }
        });
        return result;
    };
    const getProcessContent = () => {
        const properties = values.properties as AutomationProcessContentPropertiesType;
        return {
            triggers: properties.processCodeVersion === '2'
                ? processNodes<AutomationTriggerNodeType, PackageDetailsTriggerType>(
                    values.triggers,
                    packageDetails.triggerMap,
                    'triggerName',
                ) as unknown as AutomationProcessTriggerNodeType[]
                : [],
            nodes: processNodes<AutomationCommandNodeType, PackageDetailsCommandType>(
                values.nodes,
                packageDetails.commandMap,
                'commandName',
            ),
            orphans: values.orphans.map((entry) => {
                return {
                    nodes: processNodes<AutomationCommandNodeType, PackageDetailsCommandType>(
                        entry.nodes,
                        packageDetails.commandMap,
                        'commandName',
                    ),
                };
            }),
            swimlanes: (values.swimlanes || []).map((swimlane) => {
                if (!swimlane?.layout) {
                    return swimlane;
                }
                const layout: AutomationSwimLaneNodeLayoutType = {...swimlane.layout};
                normalizeLayoutNumber(layout, 'x');
                normalizeLayoutNumber(layout, 'y');
                normalizeLayoutNumber(layout, 'width');
                normalizeLayoutNumber(layout, 'height');
                return {...swimlane, layout};
            }),
            swimlaneStacking: values.swimlaneStacking,
            variables: processVariables(values.variables),
            packages: processPackages(values.packages),
            properties: {
                processCodeVersion:
                    !hasFeatureProcessEditorV2Save
                        ? '0'
                        : hasFeatureProcessEditorV1FallbackSave
                            ? properties.processCodeVersion || '0'
                            : properties.processCodeVersion === '0'
                                ? '1'
                                : properties.processCodeVersion || '1',
            },
        } as AutomationProcessContentType;
    };
    const getTaskContent = () => {
        const properties = values.properties as AutomationTaskContentPropertiesType;
        return {
            triggers: processNodes<AutomationTriggerNodeType, PackageDetailsTriggerType>(
                values.triggers,
                packageDetails.triggerMap,
                'triggerName',
            ),
            nodes: processNodes<AutomationCommandNodeType, PackageDetailsCommandType>(
                values.nodes,
                packageDetails.commandMap,
                'commandName',
            ),
            variables: processVariables(values.variables),
            packages: processPackages(values.packages),
            properties: {
                botCodeVersion: properties.botCodeVersion,
                improvedNumberSupport: properties.improvedNumberSupport,
                timeout: new Duration(parseInt(properties.timeout, 10) * 60).toString(),
                automationPriority: properties.automationPriority,
                runInChildWindow: properties.runInChildWindow,
                runInChildWindowMode: properties.runInChildWindowMode,
            },
            workItemTemplateName: values.workItemTemplateName,
        } as AutomationTaskContentType;
    };
    return {
        content: getAutomationTypeIsProcess(automationType) ? getProcessContent() : getTaskContent(),
        hasErrors,
    };
};
