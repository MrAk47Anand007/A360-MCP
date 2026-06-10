/**
 * Copyright (c) 2020 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import React, {Component, createRef} from 'react';
import {createSelector} from 'reselect';
import classnames from 'classnames';
import {Field, isPristine, getFormValues, reset} from 'redux-form';
import _get from 'lodash/get';
import _set from 'lodash/set';
import omit from 'lodash/omit';
import isEqual from 'lodash/isEqual';
import {
    Help,
    EditorPage,
    RioHeader,
    Assistant,
    AssistantEnclosure,
    Tabs, GridLayout,
    IconButton, RadioInput, RioSelectField, RioSelectInput,
    RioDetails, RioBadgeStatus, RioStatusDisplay,
    TextField, CheckboxField, CommandButton, Icon,
    Confirm, Alert, Prompt,
    RadioField,
    CheapSet, CheapMap,
    sortStable,
    triggerFrameEvent,
    getRepositoryPath,
    toLocalStorage, fromLocalStorage, Message,
    EMPTY_ARRAY,
    generateUUID,
    FieldLabel,
    ModalForm,
    EMPTY_OBJECT,
} from '@automationanywhere/rio-components';
import {
    PACKAGE_ATTRIBUTE_TYPE_SELECT,
    PACKAGE_ATTRIBUTE_TYPE_CHECKBOX,
    PACKAGE_ATTRIBUTE_TYPE_RADIO,
    PACKAGE_ATTRIBUTE_TYPE_GROUP,
    PACKAGE_ATTRIBUTE_TYPE_WINDOW,
    PACKAGE_ATTRIBUTE_TYPE_TABS,
    PACKAGE_ATTRIBUTE_TYPE_UI_OBJECT,
    PACKAGE_ATTRIBUTE_TYPE_FORM_ELEMENT,
    PACKAGE_ATTRIBUTE_TYPE_TREE,

    VALUE_TYPE_VARIABLE,
    VALUE_TYPE_VARIABLE_MAP,
    VALUE_TYPE_WINDOW,
    VALUE_TYPE_UIOBJECT,
    VALUE_TYPE_UNDEFINED,
    VALUE_TYPE_STRING,
    VALUE_TYPE_NUMBER,
    VALUE_TYPE_WORKITEM,
    VALUE_TYPE_CREDENTIAL,
    VALUE_TYPE_BOOLEAN,
    VALUE_TYPE_FILE,
    VALUE_TYPE_REGEX,
    VALUE_TYPE_LIST,
    VALUE_TYPE_DICTIONARY,
    VALUE_TYPE_RECORD,
    VALUE_TYPE_TABLE,
    VALUE_TYPE_DATETIME,
    VALUE_TYPE_COORDINATE,
    VALUE_TYPE_TASKBOT,
    VALUE_TYPE_AUTOMATION,
    VALUE_TYPE_IMAGE,
    VALUE_TYPE_PROPERTIES,
    VALUE_TYPE_REGION,
    VALUE_TYPE_FORM,
    VALUE_TYPE_FORMELEMENT,
    VALUE_TYPE_FILEREGEX,
    VALUE_TYPE_SESSION,
    VALUE_TYPE_ICONS,

    WINDOW_PRESET_NONE,

    processExpression,
    getExpressionParts,
    matchExpression,
    toExpressionParts,
    fromExpressionParts,

    getVariableMap,
    getVariableKey,
    getNewVariableName,
} from '@automationanywhere/rio-components/editor';

import {WithState} from '../../../common/WithState';
import {BotStoreHelp} from '../../../common/BotStoreHelp';
import {WithPrintable} from '../../../common/WithPrintable';
import {PackageResource} from '../../../common/PackageResource';
import {TaskbotAssistant} from '../../../editor/TaskbotAssistant';
import {TaskbotNodeDetailsAttribute} from '../../../editor/TaskbotNodeDetails/TaskbotNodeDetailsAttribute';
import {TaskbotKeyBinding} from '../../../editor/TaskbotKeyBinding';
import {TaskbotInputVariablesPrompt} from '../../../editor/TaskbotInputVariablesPrompt';
import {
    KEY_PALETTE, KEY_PALETTE_VARIABLES, KEY_PALETTE_TRIGGERS, KEY_CANVAS, KEY_CANVAS_LIST, KEY_CANVAS_FLOW, KEY_DETAILS,
    SIZE_CANVAS_DEFAULT, SIZE_PALETTE_DEFAULT, SIZE_PALETTE_MINIMUM, SIZE_DETAILS_DEFAULT, SIZE_DETAILS_MINIMUM,
    NODE_TYPE_COMMAND, NODE_TYPE_TRIGGER,
    replaceNodes, forNodes, getNode, replaceNodesDeep, getNextOrphans,
    forNodesWithMetadata,
    getPackageTriggerKey,
    getPackageCommandKey,
} from '../../../editor/utils/nodes';
import {NodeFormUtilities} from '../../../editor/utils/nodeFormUtilities';
import {getNodesWithLayout} from '../../../editor/utils/processLayout';
import {getIsVariableInputAllowed} from '../../../editor/utils/processRoot';
import {renderVariableTypeIcon} from '../../../editor/utils/typeIcon';
import {getSearchResults} from '../../../editor/utils/nodeSearch';
import {getNextNode, migrateAttributeValue, migrateNode, setNodeAttributes} from '../../../editor/utils/nodeDetails';
import {PageHelmet} from '../../../common/PageHelmet';
import {CommonDetailsPane} from '../../../common/CommonDetailsPane';
import {ErrorMessage} from '../../../common/ErrorMessage';
import {FormWarden} from '../../../common/FormWarden';
import {CodeAnalysisEditPage} from '../../policies/CodeAnalysisEditPage';
import {BotTableField} from '../../../../components/resources/bots';
import {FileChildTree, RepositoryActionFileSaveAs} from '../../../resources/repositories';
import {FileParentTable} from '../../../resources/repositories/FileDependencyTable';
import {RepositoryActionFileEdit} from '../../../resources/repositories/RepositoryActionFileEdit';
import {RepositoryActionUpdateContentPackages} from '../../../resources/repositories/RepositoryActionUpdateContentPackages';
import {RepositoryActionMetadataCopy} from '../../../resources/repositories/RepositoryActionMetadataCopy';
import {getFileRoute} from '../../../resources/repositories/FileEditHeader/utils';
import {QueuePickerInput} from '../../../resources/queues/QueuePicker/QueuePickerInput';
import {WorkItemTemplatePickerField} from '../../../resources/workItems/WorkItemTemplatePicker/WorkItemTemplatePickerField';
import {WorkItemTemplateDetails} from '../../../resources/workItems/WorkItemTemplateDetails';
import {EVENT_TYPE} from '../../../../store/constants/analytics';
import {getPackageAttributeMap, getPackageSettingsAttributes} from '../../../../store/selectors/packageAttributes';
import {getPackageDetails} from '../../../../store/selectors/packageDetails';
import {PACKAGE_STATUS_DEFAULT, PACKAGE_NAME_RECORDER, PACKAGE_STATUS_DISABLED} from '../../../../store/constants/packages';
import {
    SCOPE_BOT_EDITOR,
    BOT_EDITOR_CANVAS_VIEW,
    BOT_EDITOR_SIZE_PALETTE,
    BOT_EDITOR_SIZE_DETAILS,
    BOT_EDITOR_ASSISTANT_STYLE_DOCK_TO,
    BOT_EDITOR_ASSISTANT_STYLE_TOP,
    BOT_EDITOR_ASSISTANT_STYLE_LEFT,
    BOT_EDITOR_ASSISTANT_STYLE_HEIGHT,
    BOT_EDITOR_ASSISTANT_STYLE_WIDTH,
} from '../../../../store/constants/uiPreferences';
import {TASKBOT_RUNTIME_VIRTUAL_MODE_WINDOW, TASKBOT_RUNTIME_VIRTUAL_MODE_DESKTOP} from '../../../../store/constants/taskbotRuntime';
import {CHANGE_TYPE_PACKAGE, CHANGE_TYPE_NODE, CHANGE_TYPE_VARIABLE, CHANGE_TYPE_WORKITEM_TEMPLATE, CHANGE_TYPE_TRIGGER, CHANGE_TYPE_SETTINGS} from '../../../../store/constants/taskbotChanges';
import {WORKSPACE_PRIVATE, FILE_TYPE_TASKBOT, FILE_TYPE_HEADLESSBOT, WORKSPACE_PUBLIC, STATUS_CLONED, FILE_TYPE_TASKBOT_TEMPLATE, FILE_TYPE_PROCESS, FILE_TYPE_PROCESS_TEMPLATE, PLATFORM_TYPE_MACOS, FILE_TAG_TYPE_INTENDED_PLATFORM, FILE_TYPE_AI_AGENT_TEMPLATE} from '../../../../store/constants/repositories';
import {getFileWorkspaceName} from '../../../../store/selectors/repositories';
import {ACTIVITY_PRIORITY_LOW, ACTIVITY_PRIORITY_MEDIUM, ACTIVITY_PRIORITY_HIGH} from '../../../../store/constants/activities';
import {PROCESS_CODE_VERSIONS, TASKBOT_CODE_VERSION_DEFAULT, TASKBOT_CODE_VERSIONS} from '../../../../store/constants/taskbotCodeVersion';
import {getAutomationTypeActivityPriority, getAutomationTypeHasCanvasProcess, getAutomationTypeHasDebug, getAutomationTypeHasErrors, getAutomationTypeHasGlobalClipboard, getAutomationTypeHasManualDependencies, getAutomationTypeHasRecorder, getAutomationTypeIsProcess, getAutomationTypeIsTask} from '../../../../store/selectors/taskbotFeatures';
import {destroyNodeForms} from '../../../../store/forms/taskbotNode';
import {PROCESS_LEGACY_PACKAGES} from '../../../../store/constants/taskbotPackages';
import {getDefaultAttributes, getInitialValues} from '../../../../store/forms/taskbotNodeValues';
import {publishProcess, validateProcess} from '../../../../store/api/process';
import {getFileContent} from '../../../../store/api/repositories';
import {dispatch, getState} from '../../../../store';
import {logEvent} from '../../../../util/logger';
import {getTagValue} from '../../../../util/tags';
import {withQuery} from '../../../../util/query';
import {CREATE_SELECTOR_EFFECT_OPTIONS, CREATE_SELECTOR_IS_EQUAL_EFFECT_OPTIONS} from '../../../../util/reselect';
import {renderErrorAlert, renderErrorParts} from '../../../../util/error';
import {getRegexCharacterLiteral, getVariableRegexCharacterLiteral} from '../../../../util/regex';
import {REGEX_SPECIAL_CHARACTERS} from '../../../../util/validation';
import {compareSemanticVersions} from '../../../../util/semanticVersion';
import faviconTaskbot from '../../../../images/favicon-taskbot.svg';
import faviconTaskbotTemplate from '../../../../images/favicon-taskbot-template.svg';
import faviconHeadlessbot from '../../../../images/favicon-headlessbot.svg';
import faviconProcess from '../../../../images/favicon-process.svg';
import faviconProcessTemplate from '../../../../images/favicon-process-template.svg';

import {TaskbotEditorLoader} from './TaskbotEditorLoader';
import {TaskbotEditHeader} from './TaskbotEditHeader';
import {
    DEFAULT_EDITOR_SETTINGS,
    EDITOR_SETTING_COPILOT_FOR_AUTOMATORS,
    EDITOR_SETTING_SUGGEST_NEXT_ACTIONS,
    getEditorSettings,
} from './editorSettings';
import {getTaskAliases} from './processAliases';
import {getTaskbotContent} from './taskbotContent';
import {isObject, fromExpressionTrace, getNodePackageNames, getNodeValuePackageNames, getNodeSet, getUsedPackageSet} from './taskbotUsage';
import {applyNodeValueUpdateByAddress} from './utilities';

import './TaskbotEditPage.css';

const MAXIMUM_UNDO_REDO = 32;

const LOG_EDIT_INTERVAL = 300000;

const GLOBAL_CLIPBOARD_INTERVAL = 1000;

const INITIALIZE_UPDATE_DELAY = 100;

export const DEFAULT_VALUES = {
    triggers: [],
    nodes: [],
    orphans: [],
    swimlanes: [],
    swimlaneStacking: 'LEFT_TO_RIGHT',
    variables: [],
    breakpoints: [],
    packages: [],
    packageSettings: {},
    dependencies: [],
    workItemTemplateName: null,
    properties: {
        botCodeVersion: TASKBOT_CODE_VERSION_DEFAULT,
        processCodeVersion: '0',
        improvedNumberSupport: false,
        timeout: '',
        automationPriority: ACTIVITY_PRIORITY_MEDIUM,
        runInChildWindow: false,
        runInChildWindowMode: TASKBOT_RUNTIME_VIRTUAL_MODE_DESKTOP,
    },
    hasContent: false,
};

const isVariableEqual = (a, b) => {
    if (!a && !b) {
        return true;
    }
    if ((!a && b) || (a && !b)) {
        return false;
    }
    if (
        a.name !== b.name ||
        a.type !== b.type ||
        (a.description || '') !== (b.description || '') ||
        Boolean(a.readOnly) !== Boolean(b.readOnly) ||
        Boolean(a.input) !== Boolean(b.input) ||
        Boolean(a.output) !== Boolean(b.output) ||
        Boolean(a.workItem) !== Boolean(b.workItem)
    ) {
        return false;
    }
    switch (a.type) {
        case VALUE_TYPE_LIST:
        case VALUE_TYPE_DICTIONARY:
            if (a.subtype !== b.subtype) {
                return false;
            }
            break;
        case VALUE_TYPE_RECORD:
            if ((a.schema?.length > 0 || b.schema?.length > 0) && !isEqual(a.schema, b.schema)) {
                return false;
            }
            break;
        case VALUE_TYPE_SESSION:
            if (a.sessionType !== b.sessionType) {
                return false;
            }
            break;
    }
    if ((a.defaultValue || b.defaultValue) && !isEqual(a.defaultValue, b.defaultValue)) {
        return false;
    }
    return true;
};

const updateNodeValues = (nodes, updateValue, updateAttributeDefaults, updateNode) => {
    const updateObject = (lastObject, entries) => {
        if (!lastObject) {
            return lastObject;
        }
        let nextObject = lastObject;
        entries.forEach(([key, getValue]) => {
            if (!(key in lastObject)) {
                return;
            }
            const value = getValue(lastObject[key]);
            if (value === lastObject[key]) {
                return;
            }
            if (nextObject === lastObject) {
                nextObject = {...lastObject};
            }
            if (value) {
                nextObject[key] = value;
            }
            else {
                delete nextObject[key];
            }
        });
        return nextObject;
    };
    const updateReturns = (lastReturns, attributeName, parents) => {
        if (!lastReturns) {
            return lastReturns;
        }
        let nextReturns = lastReturns;
        Object.keys(lastReturns).forEach((key) => {
            const value = updateValue(lastReturns[key], attributeName, parents);
            if (value === lastReturns[key]) {
                return;
            }
            if (nextReturns === lastReturns) {
                nextReturns = {...lastReturns};
            }
            if (value) {
                nextReturns[key] = value;
            }
            else {
                delete nextReturns[key];
            }
        });
        return nextReturns;
    };
    const updateAttributes = (attributes, parents, attributeName) => {
        if (!attributes || !attributes.length) {
            return attributes;
        }
        let changed = false;
        const changedAttributes = attributes.map((attribute) => {
            if (!attribute) {
                return attribute;
            }
            let nextAttribute = updateObject(attribute, [
                ['value', (value) => updateValue(value, attribute.name || attributeName, parents)],
                ['attributes', (attributes) => updateAttributes(attributes, [attribute, ...parents], attribute.name || attributeName)],
                ['operatorAttribute', (operatorAttribute) => updateAttributes([operatorAttribute], parents, attribute.name || attributeName)[0]],
                ['groupAttribute', (groupAttribute) => updateAttributes([groupAttribute], parents, attribute.name || attributeName)[0]],
                ['returnTo', (returnTo) => updateValue(returnTo, attribute.name || attributeName, parents)],
                ['returns', (returns) => updateReturns(returns, attribute.name || attributeName, parents)],
            ]);
            if (updateAttributeDefaults) {
                if (nextAttribute.attributes?.length > 0) {
                    const nextAttributeAttributes = nextAttribute.attributes.map((attribute) => updateAttributeDefaults(attribute, parents));
                    if (nextAttributeAttributes.some((attribute, index) => attribute !== nextAttribute.attributes[index])) {
                        nextAttribute = {...nextAttribute, attributes: nextAttributeAttributes};
                    }
                }
                if (nextAttribute.operatorAttribute) {
                    const nextOperatorAttribute = updateAttributeDefaults(nextAttribute.operatorAttribute, parents);
                    if (nextOperatorAttribute !== nextAttribute.operatorAttribute) {
                        nextAttribute = {...nextAttribute, operatorAttribute: nextOperatorAttribute};
                    }
                }
                if (nextAttribute.groupAttribute) {
                    const nextGroupAttribute = updateAttributeDefaults(nextAttribute.groupAttribute, parents);
                    if (nextGroupAttribute !== nextAttribute.groupAttribute) {
                        nextAttribute = {...nextAttribute, groupAttribute: nextGroupAttribute};
                    }
                }
            }
            if (nextAttribute !== attribute) {
                changed = true;
            }

            return nextAttribute;
        });
        return changed ? changedAttributes : attributes;
    };
    const updateNodes = (nodes) => {
        if (!nodes || !nodes.length) {
            return nodes;
        }
        let changed = false;
        const changedNodes = nodes.map((node) => {
            if (!node) {
                return node;
            }
            let nextNode = updateObject(node, [
                ['attributes', (attributes) => updateAttributes(attributes, [node])],
                ['children', (children) => updateNodes(children)],
                ['branches', (branches) => updateNodes(branches)],
                ['returnTo', (returnTo) => updateValue(returnTo, [node])],
                ['returns', (returns) => updateReturns(returns, [node])],
            ]);
            if (updateAttributeDefaults) {
                nextNode = updateAttributeDefaults(nextNode);
            }
            if (updateNode) {
                nextNode = updateNode(nextNode);
            }
            if (nextNode !== node) {
                changed = true;
            }
            return nextNode;
        });
        return changed ? changedNodes : nodes;
    };
    return updateNodes(nodes);
};

const getNodeValueVariables = (value, variableSet, globalValues, taskAliases, variableMap, commandMap, commandProperties, t) => {
    if (!value) {
        return;
    }

    if (value.type === VALUE_TYPE_VARIABLE) {
        if (value.variableName) {
            variableSet.add(getVariableKey(value.packageName ? `${value.packageName}:${value.variableName}` : value.variableName));
        }
    }
    else if (value.type === VALUE_TYPE_VARIABLE_MAP) {
        if (value.variableMapNames?.length > 0) {
            value.variableMapNames.forEach((variableName) => {
                if (variableName) {
                    variableSet.add(getVariableKey(variableName));
                }
            });
        }
    }
    else if (value.expression) {
        let lastIndex = 0;
        let expressionIndex;
        while ((expressionIndex = value.expression.indexOf('$', lastIndex)) !== -1) {
            const match = matchExpression(value.expression.slice(expressionIndex));
            if (!match) {
                lastIndex = expressionIndex + 1;
                continue;
            }

            const text = match[0];
            lastIndex = expressionIndex + text.length;
            const result = processExpression(text, value.type, globalValues, taskAliases, variableMap, commandMap, commandProperties, t);
            fromExpressionTrace(result.trace,
                (variable) => {
                    if (!variable.packageName) {
                        variableSet.add(getVariableKey(variable.name));
                    }
                },
            );
        }
    }
};

const isEmpty = (nodes) => {
    if (!nodes?.length) {
        return true;
    }
    return !nodes.some((node) => node && node.uid && !node.disabled);
};

const getFileInfoFromFrame = (frame) => {
    const filePath = unescape(
        frame.fileUri
            .replace(/^\w+[:][/]+/, '')
            .replace(/[?].*$/, ''),
    ).split('/').join('\\');
    const fileId = frame.fileUri.replace(/.*[?&]fileId=(\d+).*/, '$1');
    return {filePath, fileId};
};

const getNodesChange = (lastNodes, lastVariables, variableNamePattern) => {
    let nextVariables = lastVariables;
    const nextNodes = updateNodeValues(lastNodes, function updateValue(value) {
        let nextValue = value;
        switch (value?.type) {
            case VALUE_TYPE_WINDOW:
                if (value.window && (!value.window.presetType || value.window.presetType === WINDOW_PRESET_NONE)) {
                    nextValue = {type: VALUE_TYPE_WINDOW};
                    let variable = nextVariables.find((variable) => {
                        if (!variable.defaultValue || variable.defaultValue.type !== VALUE_TYPE_WINDOW || !variable.defaultValue.window) {
                            return false;
                        }

                        return variable.defaultValue.window.name === value.window.name && isEqual(variable.defaultValue.window, value.window);
                    });
                    let variableName;
                    if (variable) {
                        variableName = variable.name;
                    }
                    else {
                        variableName = getNewVariableName(value.window.windowType?.startsWith('BROWSER_') ? 'Browser' : 'Window', variableNamePattern, nextVariables, true);
                        variable = {
                            key: getVariableKey(variableName),
                            name: variableName,
                            description: '',
                            type: VALUE_TYPE_WINDOW,
                            readOnly: true,
                            input: false,
                            output: false,
                            defaultValue: omit(value, 'windowResize'),
                        };
                        if (nextVariables === lastVariables) {
                            nextVariables = [...lastVariables];
                        }
                        nextVariables.push(variable);
                    }
                    nextValue.expression = `$${variable.name}$`;
                    if (value.windowResize) {
                        nextValue.windowResize = value.windowResize;
                    }
                }
                break;
            case VALUE_TYPE_UIOBJECT:
                if (value.uiObjectWindow && (!value.uiObjectWindow.presetType || value.uiObjectWindow.presetType === WINDOW_PRESET_NONE)) {
                    const nextUiObjectWindow = updateValue(value.uiObjectWindow);
                    if (value.uiObjectWindow !== nextUiObjectWindow) {
                        nextValue = {
                            ...value,
                            uiObjectWindow: nextUiObjectWindow,
                        };
                    }
                }
                break;
        }
        return nextValue;
    });
    return [nextNodes, nextVariables];
};

const updateNestedValue = (getUpdatedValue) => {
    const getNestedValue = (rootValue) => {
        if (!rootValue) {
            return rootValue;
        }
        let updated = false;
        const updateValue = (value) => {
            const nextValue = getNestedValue(value);
            if (nextValue !== value) {
                updated = true;
            }
            return nextValue;
        };
        const cloneValue = structuredClone(rootValue);
        switch (rootValue.type) {
            // These potentially contain complex data types
            case VALUE_TYPE_LIST:
                if (cloneValue.list?.length > 0) {
                    cloneValue.list = cloneValue.list.map(updateValue);
                }
                break;
            case VALUE_TYPE_DICTIONARY:
                if (cloneValue.dictionary?.length > 0) {
                    cloneValue.dictionary = cloneValue.dictionary.map((entry) => ({
                        ...entry,
                        value: updateValue(entry.value),
                    }));
                }
                break;
            case VALUE_TYPE_WORKITEM:
            case VALUE_TYPE_RECORD:
                if (cloneValue.record?.values?.length > 0) {
                    cloneValue.record.values = cloneValue.record.values.map(updateValue);
                }
                break;
            case VALUE_TYPE_TABLE:
                if (cloneValue.table?.rows?.length > 0) {
                    cloneValue.table.rows.forEach((row) => {
                        if (row?.values?.length > 0) {
                            row.values = row.values.map(updateValue);
                        }
                    });
                }
                break;
            case VALUE_TYPE_AUTOMATION: {
                if (cloneValue.automation) {
                    if (cloneValue.automation.file) {
                        cloneValue.automation.file = updateValue(cloneValue.automation.file);
                    }
                    if (cloneValue.automation.filePath) {
                        cloneValue.automation.filePath = updateValue(cloneValue.automation.filePath);
                    }
                    if (cloneValue.automation.inputVariables?.length > 0) {
                        cloneValue.automation.inputVariables = cloneValue.automation.inputVariables.map((entry) => ({
                            ...entry,
                            value: updateValue(entry.value),
                        }));
                    }
                }
                break;
            }
            case VALUE_TYPE_TASKBOT: {
                if (cloneValue.taskbotFile) {
                    cloneValue.taskbotFile = updateValue(cloneValue.taskbotFile);
                }
                if (cloneValue.taskbotInput) {
                    cloneValue.taskbotInput = updateValue(cloneValue.taskbotInput);
                }
                break;
            }
            // These contain simple data types
            case VALUE_TYPE_COORDINATE:
                if (isObject(cloneValue.coordinate)) {
                    cloneValue.coordinate.x = updateValue(cloneValue.coordinate.x);
                    cloneValue.coordinate.y = updateValue(cloneValue.coordinate.y);
                }
                break;
            case VALUE_TYPE_REGION:
                if (isObject(cloneValue.region)) {
                    cloneValue.region.x = updateValue(cloneValue.region.x);
                    cloneValue.region.y = updateValue(cloneValue.region.y);
                    cloneValue.region.width = updateValue(cloneValue.region.width);
                    cloneValue.region.height = updateValue(cloneValue.region.height);
                }
                break;
            case VALUE_TYPE_WINDOW:
                if (isObject(cloneValue.windowResize)) {
                    cloneValue.windowResize.width = updateValue(cloneValue.windowResize.width);
                    cloneValue.windowResize.height = updateValue(cloneValue.windowResize.height);
                }
                break;
            case VALUE_TYPE_UIOBJECT:
                if (isObject(cloneValue.uiObject?.criteria)) {
                    Object.entries(cloneValue.uiObject.criteria).forEach(([key, entry]) => {
                        if (entry.value) {
                            cloneValue.uiObject.criteria[key].value = updateValue(entry.value);
                        }
                    });
                }
                if (isObject(cloneValue.uiObjectAnchor?.uiObject?.criteria)) {
                    Object.entries(cloneValue.uiObjectAnchor.uiObject.criteria).forEach(([key, entry]) => {
                        if (entry.value) {
                            cloneValue.uiObjectAnchor.uiObject.criteria[key].value = updateValue(entry.value);
                        }
                    });
                }
                if (cloneValue.uiObjectWindow) {
                    cloneValue.uiObjectWindow = updateValue(cloneValue.uiObjectWindow);
                }
                break;
            case VALUE_TYPE_PROPERTIES:
                if (cloneValue.properties?.length > 0) {
                    cloneValue.properties = cloneValue.properties.map((entry) => {
                        return {
                            ...entry,
                            value: updateValue(entry.value),
                        };
                    });
                }
                break;
            case VALUE_TYPE_REGEX:
                if (cloneValue.list?.length > 0) {
                    cloneValue.list = cloneValue.list.map((entry) => {
                        return {
                            ...entry,
                            value: updateValue(entry.value),
                        };
                    });
                }
                break;
            case VALUE_TYPE_FILEREGEX:
                if (cloneValue.fileRegex?.name?.list?.length > 0) {
                    cloneValue.fileRegex.name.list = cloneValue.fileRegex.name.list.map((entry) => {
                        return {
                            ...entry,
                            value: updateValue(entry.value),
                        };
                    });
                }
                break;
            case VALUE_TYPE_SESSION:
                if (cloneValue.sessionName) {
                    cloneValue.sessionName = updateValue(cloneValue.sessionName);
                }
                break;
        }
        return getUpdatedValue(updated ? cloneValue : rootValue);
    };
    return getNestedValue;
};

const getVariableReferenceUpdateValue = (nextVariableName, lastVariableName) => {
    const targetVariableKey = getVariableKey(lastVariableName);
    const updateExpression = (text) => {
        if (!text || text.length < 3 || !text.startsWith('$') || !text.endsWith('$')) {
            return text;
        }
        const parts = getExpressionParts(text).map(updateExpression);
        if (parts[1] !== ':' && getVariableKey(parts[0]) === targetVariableKey) {
            parts[0] = nextVariableName;
        }
        return `$${parts.join('')}$`;
    };
    return updateNestedValue((value) => {
        let nextValue = value;
        if (value?.type) {
            if (value.type === VALUE_TYPE_VARIABLE) {
                if (value.variableName && !value.packageName && getVariableKey(value.variableName) === targetVariableKey) {
                    return {
                        type: VALUE_TYPE_VARIABLE,
                        variableName: nextVariableName,
                    };
                }
            }
            else if (value.type === VALUE_TYPE_VARIABLE_MAP) {
                if (value.variableMapNames?.length > 0) {
                    const targetVariableIndex = value.variableMapNames.findIndex((variableName) => getVariableKey(variableName) === targetVariableKey);
                    if (targetVariableIndex > -1) {
                        const nextVariableMapNames = [...value.variableMapNames];
                        nextVariableMapNames[targetVariableIndex] = nextVariableName;
                        return {
                            type: VALUE_TYPE_VARIABLE_MAP,
                            variableMapNames: nextVariableMapNames,
                        };
                    }
                }
            }
            else if (typeof value.expression === 'string' && getVariableKey(value.expression).includes(targetVariableKey)) {
                const lastExpression = value.expression;

                let lastIndex = 0;
                let expressionIndex;
                const expressionParts = [];
                while ((expressionIndex = lastExpression.indexOf('$', lastIndex)) !== -1) {
                    const match = matchExpression(lastExpression.slice(expressionIndex));
                    if (!match) {
                        expressionParts.push(lastExpression.slice(lastIndex, expressionIndex + 1));
                        lastIndex = expressionIndex + 1;
                        continue;
                    }

                    expressionParts.push(lastExpression.slice(lastIndex, expressionIndex));
                    const text = match[0];
                    lastIndex = expressionIndex + text.length;
                    expressionParts.push(updateExpression(text));
                }
                const trailingText = lastExpression.slice(lastIndex);
                if (trailingText) {
                    expressionParts.push(trailingText);
                }
                const nextExpression = expressionParts.join('');
                if (value.expression !== nextExpression) {
                    nextValue = {
                        ...value,
                        expression: nextExpression,
                    };
                }
            }
        }
        return nextValue;
    });
};

class TaskbotEditPage extends Component {
    static displayName = 'TaskbotEditPage';

    constructor(props) {
        super(props);

        this.assistantButtonRef = createRef();
        this.assistantEnclosureRef = createRef();

        this.selectMode = createSelector(
            (props) => props.debugger,
            (props) => props.automationFile,
            (props) => props.route.mode,
            (dbugger, automationFile, mode) => !automationFile ? 'view' : dbugger && !dbugger.run ? 'debug' : mode,
        );

        const selectTriggers = (props) => props.getFieldValue('triggers') || EMPTY_ARRAY;
        const selectNodes = (props) => props.getFieldValue('nodes') || EMPTY_ARRAY;
        const selectOrphanNodes = (props) => props.getFieldValue('nodes') || EMPTY_ARRAY;
        const selectPackages = (props) => props.getFieldValue('packages') || EMPTY_ARRAY;
        const selectVariables = (props) => props.getFieldValue('variables') || EMPTY_ARRAY;
        const selectDependencies = (props) => props.getFieldValue('dependencies') || EMPTY_ARRAY;
        const selectProcessCodeVersion = (props) => props.getFieldValue('properties')?.processCodeVersion || '0';

        this.selectHasTriggers = createSelector(
            selectTriggers,
            (triggers) => triggers.some((trigger) => !trigger.disabled),
        );

        this.hasWorkItemTemplate = createSelector(
            (props) => props.getFieldValue('workItemTemplateName'),
            (workItemTemplateName) => Boolean(workItemTemplateName),
        );

        this.selectCheckWorkspace = createSelector(
            (props) => props.workspaceName,
            (props) => props.params.fileId,
            (props) => props.automationFile,
            (props) => props.route.type,
            (props) => props.route.mode,
            (props) => props.params.versionNumber,
            (workspaceName, automationId, automationFile, type, mode, versionNumber) => {
                if (!automationFile || automationFile.id !== automationId) {
                    return;
                }
                const currentPath = [
                    '/bots/repository',
                    workspaceName,
                    type,
                    automationFile.id,
                    mode,
                    versionNumber ? `/versions/${versionNumber}` : '',
                ].filter(Boolean).join('/');
                const targetWorkspaceName = getFileWorkspaceName(automationFile);
                const targetType = getAutomationTypeIsProcess(automationFile.type)
                    ? 'files/process'
                    : getAutomationTypeIsTask(automationFile.type)
                        ? 'files/task'
                        : 'files';
                let targetPath = [
                    '/bots/repository',
                    targetWorkspaceName,
                    targetType,
                    automationFile.id,
                    targetWorkspaceName === WORKSPACE_PUBLIC || automationFile.botStatus === STATUS_CLONED ? 'view' : mode,
                    targetWorkspaceName === WORKSPACE_PUBLIC && versionNumber ? `/versions/${versionNumber}` : '',
                ].filter(Boolean).join('/');
                if (currentPath !== targetPath) {
                    const {router, actions} = this.props;
                    const breadcrumbs = router?.searchParams?.get('breadcrumbs');
                    if (breadcrumbs) {
                        targetPath = withQuery(targetPath, `breadcrumbs=${breadcrumbs}`);
                    }
                    actions.routerReplace(targetPath);
                }
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectGetDebugPoints = createSelector(
            (props) => props.params.fileId,
            (props) => props.automationFile,
            (props) => props.params.workspaceName,
            (automationId, automationFile, workspaceName) => {
                if (!automationId || !automationFile || workspaceName !== WORKSPACE_PRIVATE) {
                    return;
                }
                if (!getAutomationTypeHasDebug(automationFile.type)) {
                    return;
                }
                const {actions} = this.props;
                actions.repositoriesGetDebugPoints(automationId, (result) => {
                    const {breakpoints: breakpointsList, watchVariables} = result;
                    const variablesList = watchVariables.map((watchVariable) => watchVariable.variableName);
                    this.setState({
                        debugPointsMap: new CheapMap().set(automationFile.path, {
                            breakpoints: breakpointsList.map((breakpoint) => breakpoint.nodeUid),
                            watchVariables: CheapSet.fromArray(variablesList),
                        }),
                    });
                });
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectInitialize = createSelector(
            (props) => props.formInitialValues,
            (initialValues) => {
                const {
                    automationType,
                    hasFeatureProcessEditorV2Save,
                    hasFeatureProcessEditorV1FallbackSave,
                    hasFeatureProcessEditorPackageManager,
                    onRunInChildWindowChange,
                    onRunInChildWindowModeChange,
                    initialize,
                    change,
                    route: {mode},
                } = this.props;
                initialize(initialValues);
                onRunInChildWindowChange(initialValues.properties.runInChildWindow);
                onRunInChildWindowModeChange(initialValues.properties.runInChildWindowMode);
                if (mode === 'edit' && getAutomationTypeIsProcess(automationType)) {
                    const {
                        packages,
                        properties: {processCodeVersion = '0'},
                    } = initialValues;
                    let nextProcessCodeVersion = processCodeVersion;
                    let nextPackages = packages;
                    if (
                        hasFeatureProcessEditorV2Save &&
                        !hasFeatureProcessEditorV1FallbackSave &&
                        processCodeVersion === '0'
                    ) {
                        nextProcessCodeVersion = hasFeatureProcessEditorPackageManager
                            ? PROCESS_CODE_VERSIONS.at(0).processCodeVersion
                            : '1';
                        if (Number(nextProcessCodeVersion) >= 2) {
                            nextPackages = [];
                        }
                    }
                    else if (
                        !hasFeatureProcessEditorV2Save &&
                        processCodeVersion !== '0'
                    ) {
                        nextProcessCodeVersion = '0';
                        nextPackages = packages.map(({name}) => ({
                            name,
                            version: '*',
                        }));
                    }
                    if (nextProcessCodeVersion !== processCodeVersion || nextPackages !== packages) {
                        setTimeout(
                            () => {
                                change('properties.processCodeVersion', nextProcessCodeVersion);
                                change('packages', nextPackages);
                            },
                            INITIALIZE_UPDATE_DELAY,
                        );
                    }
                }
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectGetAutomation = createSelector(
            (props) => props.params.workspaceName,
            (props) => props.params.fileId,
            (props) => props.params.versionNumber,
            (props) => props.route.mode,
            (props, state) => state.refresh,
            (workspaceName, automationId, versionNumber, mode) => {
                if (!automationId) {
                    return;
                }
                this.setState({
                    undo: [],
                    redo: [],
                    collapsed: CheapSet.fromArray([
                        KEY_PALETTE_TRIGGERS,
                        KEY_PALETTE_VARIABLES,
                        KEY_CANVAS_LIST,
                    ]),
                    opened: new CheapMap(),
                    tabId: 'editor',
                    packageVersionChoice: {},
                    panZoom: null,
                    assistantShow: false,
                    assistantPage: null,
                    search: '',
                    searchParameters: null,
                    chatbot: null,
                    chatbotRecorderCurrentTabId: null,
                }, () => {
                    const {actions} = this.props;
                    actions.globalValuesListBasic();
                    actions.repositoriesGetFile(workspaceName, automationId, true, mode === 'edit', versionNumber);
                    actions.uiPreferencesGet([SCOPE_BOT_EDITOR], this.handlePreferencesUpdate);
                });
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        const selectVariablePaths = createSelector(
            selectVariables,
            (variables) => {
                const variablePaths = new Set();
                variables.forEach((variable) => {
                    if (!variable) {
                        return;
                    }
                    let path;
                    switch (variable.type) {
                        case VALUE_TYPE_FORM: {
                            if (variable.defaultValue?.file?.string) {
                                path = getRepositoryPath(variable.defaultValue.file.string);
                            }
                        }
                    }
                    if (path) {
                        variablePaths.add(path);
                    }
                });
                return variablePaths;
            },
        );

        const selectNodePaths = createSelector(
            selectNodes,
            (nodes) => {
                const nodePaths = new Set();
                const onAttribute = (attribute) => {
                    if (!attribute) {
                        return;
                    }
                    switch (attribute.value?.type) {
                        case VALUE_TYPE_TASKBOT: {
                            const path = getRepositoryPath(attribute.value.taskbotFile?.string?.replace(/\$/g, () => '$$'));
                            if (path) {
                                nodePaths.add(path);
                            }
                            break;
                        }
                    }
                    attribute.attibutes?.forEach(onAttribute);
                    onAttribute(attribute.operatorAttribute);
                    onAttribute(attribute.groupAttribute);
                };
                forNodes(nodes, (node) => {
                    node.attributes?.forEach(onAttribute);
                }, (node) => node?.uid && !node.disabled);
                return nodePaths;
            },
        );

        this.selectFileInterfacePaths = createSelector(
            selectVariablePaths,
            selectNodePaths,
            (variablePaths, nodePaths) => [...new Set([...variablePaths, ...nodePaths])],
        );

        this.selectGetFileInterfaces = createSelector(
            (props) => props.params.workspaceName,
            this.selectFileInterfacePaths,
            (props) => props.fileInterfaceMap,
            (workspaceName, fileInterfacePaths, fileInterfaceMap) => {
                const {actions} = this.props;
                fileInterfacePaths.forEach((path) => {
                    const fileInterface = fileInterfaceMap[path];
                    // undefined == unloaded
                    // null == empty
                    if (fileInterface === undefined) {
                        actions.repositoriesGetFileInterface(workspaceName, path);
                    }
                });
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectGetInitialPackageVersions = createSelector(
            (props) => props.route.mode,
            (props) => props.params.fileId,
            (props) => props.automationType,
            (props) => props.formInitialValues.hasContent,
            (props) => props.formInitialValues.packages,
            (props) => props.formInitialValues.properties?.processCodeVersion || '0',
            (props, state) => state.refresh,
            (mode, automationId, automationType, hasContent, formPackages, processCodeVersion) => {
                if (!automationId || !hasContent) {
                    return;
                }
                const {
                    hasFeatureProcessEditorV2Save,
                    hasFeatureProcessEditorV1FallbackSave,
                    hasFeatureProcessEditorPackageManager,
                    actions,
                } = this.props;
                if (getAutomationTypeIsProcess(automationType)) {
                    let nextProcessCodeVersion = processCodeVersion;
                    if (mode === 'edit') {
                        switch (nextProcessCodeVersion) {
                            case '0':
                                if (!hasFeatureProcessEditorV1FallbackSave && hasFeatureProcessEditorV2Save) {
                                    nextProcessCodeVersion = hasFeatureProcessEditorPackageManager
                                        ? PROCESS_CODE_VERSIONS.at(0).processCodeVersion
                                        : '1';
                                }
                                break;
                            default:
                                if (!hasFeatureProcessEditorV2Save) {
                                    nextProcessCodeVersion = '0';
                                }
                                break;
                        }
                    }
                    switch (nextProcessCodeVersion) {
                        case '0':
                        case '1':
                            actions.packagesGetTaskbotVersions(PROCESS_LEGACY_PACKAGES, true);
                            return;
                    }
                }
                actions.packagesGetTaskbotVersions(formPackages, mode !== 'edit');
            },
            CREATE_SELECTOR_IS_EQUAL_EFFECT_OPTIONS,
        );

        this.selectGetMissingPackageVersions = createSelector(
            (props) => props.params.fileId,
            (props) => props.automationType,
            (props) => props.packages,
            selectPackages,
            selectProcessCodeVersion,
            (automationId, automationType, loadedPackages, formPackages, processCodeVersion) => {
                const {actions} = this.props;
                if (!automationId || !loadedPackages?.length) {
                    return;
                }
                if (getAutomationTypeIsProcess(automationType) && ['0', '1'].includes(processCodeVersion)) {
                    return;
                }
                const currentVersions = new Map();
                loadedPackages.forEach(({name, packageVersion}) => currentVersions.set(name, packageVersion));
                const missingVersions = formPackages.filter(({name, version}) => currentVersions.get(name) !== version);
                if (!missingVersions.length) {
                    return;
                }
                actions.packagesGetTaskbotMissingVersions(missingVersions);
            },
            CREATE_SELECTOR_IS_EQUAL_EFFECT_OPTIONS,
        );

        this.selectIsPristine = createSelector(
            (props) => props.pristine,
            (props, state) => state.opened,
            (pristine, opened) => {
                if (!pristine) {
                    return false;
                }
                if (opened.size > 0) {
                    for (const entry of opened) {
                        if (entry.value === 'edit') {
                            return false;
                        }
                    }
                }
                return true;
            },
        );

        this.selectPackageNames = createSelector(
            (props) => props.packages,
            (packages) => {
                const packageNames = new Set();
                if (packages?.length > 0) {
                    packages.forEach(({name}) => packageNames.add(name));
                }
                return packageNames;
            },
        );

        const selectVariableMap = createSelector(
            (props) => props.packageDetails,
            selectVariables,
            (packageDetails, variables) => getVariableMap(packageDetails.variableGroups, packageDetails.variableMap, variables),
        );

        this.selectReferencedVariablesSet = createSelector(
            selectNodes,
            (props) => props.globalValues,
            (props) => props.taskAliases,
            selectVariableMap,
            (props) => props.packageDetails,
            (nodes, globalValues, taskAliases, variableMap, packageDetails) => {
                const usedVariableSet = new CheapSet();
                const {commandMap, commandProperties} = packageDetails;
                getNodeSet(null, getNodeValueVariables, nodes, usedVariableSet, globalValues, taskAliases, variableMap, commandMap, commandProperties, (s) => s);
                return usedVariableSet;
            },
        );

        this.selectRecorderPackage = createSelector(
            (props) => props.packageDetails,
            (packageDetails) => {
                const {commandMap, packageMap} = packageDetails;
                const command = Object.values(commandMap).find((command) => command.recordable && command.packageName === PACKAGE_NAME_RECORDER);
                if (!command) {
                    return null;
                }

                return packageMap[command.packageName] || null;
            },
        );

        this.selectError = createSelector(
            (props) => props.updateError || null,
            (error) => {
                this.setState({error});
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectRefresh = createSelector(
            (props) => props.automationFile,
            (props) => props.packages,
            selectPackages,
            selectTriggers,
            selectNodes,
            selectOrphanNodes,
            selectVariables,
            selectDependencies,
            () => {
                triggerFrameEvent('resize');
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectGlobalClipboard = createSelector(
            (props, state) => state.globalClipboardUid,
            (globalClipboardUid) => {
                const globalClipboard = fromLocalStorage('globalClipboard');
                if (globalClipboard?.uid === globalClipboardUid) {
                    return globalClipboard;
                }
            },
        );

        this.selectDisabledDependencies = createSelector(
            (props) => props.automationFile,
            (props) => props.taskbotDependencies,
            (automationFile, taskbotDependencies) => {
                if (!Array.isArray(taskbotDependencies)) {
                    return [];
                }
                const disabledIds = [];
                const targetIntendedPlatform = getTagValue(automationFile?.tags, FILE_TAG_TYPE_INTENDED_PLATFORM);
                if (targetIntendedPlatform) {
                    taskbotDependencies.forEach((dependency) => {
                        const intendedPlatform = getTagValue(dependency?.tags, FILE_TAG_TYPE_INTENDED_PLATFORM);
                        if (intendedPlatform && targetIntendedPlatform && targetIntendedPlatform !== intendedPlatform) {
                            disabledIds.push(dependency.id);
                        }
                    });
                }
                return disabledIds;
            },
        );

        this.selectSearchResults = createSelector(
            (props) => props.t,
            (props) => props.packageDetails,
            (props) => props.automationReport,
            (props, state) => state.search?.trim() ?? '',
            (props, state) => state.searchParameters,
            getSearchResults,
        );

        let lastPaletteSize = null;
        this.selectDebuggerReady = createSelector(
            (props) => Boolean(props.debugger?.ready),
            (isDebuggerReady) => {
                const paletteSize = this.state.sizes.get(KEY_PALETTE);
                if (isDebuggerReady) {
                    this.setState({
                        sizes: this.state.sizes.set(KEY_PALETTE, 0).clone(),
                    });
                    lastPaletteSize = paletteSize;
                    return;
                }

                if (!paletteSize && lastPaletteSize > 0) {
                    this.setState({
                        sizes: this.state.sizes.set(KEY_PALETTE, lastPaletteSize).clone(),
                    });
                }
                lastPaletteSize = null;
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        const initialCollapsed = [
            KEY_PALETTE_TRIGGERS,
            KEY_PALETTE_VARIABLES,
            KEY_CANVAS_LIST,
        ];
        this.state = {
            undo: [],
            redo: [],

            lastEditorCanvas: 'flow',

            groups: CheapSet.fromArray([
                'variable-group:USER_DEFINED',
            ]),

            collapsed: CheapSet.fromArray(initialCollapsed),

            opened: new CheapMap(),

            sizes: CheapMap.fromObject({
                [KEY_PALETTE]: SIZE_PALETTE_DEFAULT,
                [KEY_CANVAS]: SIZE_CANVAS_DEFAULT,
                [KEY_DETAILS]: SIZE_DETAILS_DEFAULT,
            }),

            cursor: null,

            clipboard: null,

            tabId: 'editor',

            editorSettings: DEFAULT_EDITOR_SETTINGS,

            error: null,
            errorBlocking: false,

            message: null,

            externalOptions: Object.create(null),

            packageVersionChoice: {},

            panZoom: null,

            inputVariableShow: false,
            inputVariableList: [],
            inputVariableValues: {},
            inputVariableCallback: null,

            globalClipboardUid: null,
            globalClipboardMessage: null,

            packageUpdate: null,

            copyMetadata: null,

            fileSaveAs: null,

            isGettingFileInterfaces: false,

            assistantShow: false,
            assistantStyle: Assistant.INITIAL_STYLE,
            assistantPage: null,

            search: '',
            searchParameters: null,

            refresh: 0,
            showKeyBindings: false,
            chatbot: null,

            debugPointsMap: new CheapMap(),

            dirty: 0,

            chatbotRecorderCurrentTabId: null,
        };

        this.dirty = () => this.setState((state) => ({dirty: state.dirty + 1}));
    }

    handleFileOpen = (file) => {
        if (!file) {
            return;
        }
        const mode = this.selectMode(this.props);
        if (mode === 'debug') {
            return;
        }
        this.handleCheckUnsaved(() => {
            const {moduleFileTypes, router, params: {fileId}, actions} = this.props;
            const pageVariant = file.workspaceType === 'PRIVATE' && file.permission?.editContent ? 'EDIT' : 'VIEW';
            const route = getFileRoute(file, pageVariant, moduleFileTypes);
            const breadcrumbs = router?.searchParams?.get('breadcrumbs');
            const nextBreadcrumbs = [
                breadcrumbs,
                [fileId, mode].filter(Boolean).join('-'),
            ].filter(Boolean).join(',');
            const path = `${route}${route.includes('?') ? '&' : '?'}breadcrumbs=${nextBreadcrumbs}`;
            actions.pagesNavigate(path);
        });
    };

    handleSearchChange = (search) => {
        if (this.state.search !== search) {
            this.setState({search});
        }
    };

    handleSearchParametersChange = (searchParameters) => {
        this.setState((lastState) => {
            return {
                searchParameters: lastState.searchParameters && !searchParameters
                    ? {...lastState.searchParameters, type: null}
                    : searchParameters || null,
            };
        });
    };

    handleSearchResultsReplace = ({search, searchParameters, searchResults, replace, replaceSelection}) => {
        const {actions, automationType, t} = this.props;
        if (searchParameters?.type !== 'replace') {
            return;
        }
        // TODO: using some internals of the expression code, refactor later to support deep edits more efficiently
        const PART_SUBSTITUTION = 'SOMEVERYLONGVERBOSESTRINGTHATWONTCOLLIDEWITHREALDATA';
        const nodeReplaceMap = new Map();
        if (searchResults?.length > 0) {
            searchResults.forEach((result) => {
                if (result.matches?.length > 0) {
                    nodeReplaceMap.set(result.uid, result.matches);
                }
            });
        }
        if (!nodeReplaceMap.size) {
            return;
        }
        clearTimeout(this.pageClickTimeout);
        this.handleApplyNodeDetails(() => {
            const {getFieldValue, change} = this.props;
            const searchVariableNameRegex = new RegExp(`[$]${search.split('').map(getVariableRegexCharacterLiteral).join('')}`);
            const searchTextRegex = new RegExp(search.split('').map(getRegexCharacterLiteral).join(''));
            const replaceValue = (value) => {
                if (!value) {
                    return null;
                }
                if (searchParameters.nodeValueString) {
                    switch (value.type) {
                        case VALUE_TYPE_STRING:
                            if (value.string && searchTextRegex.test(value.string)) {
                                return {
                                    type: VALUE_TYPE_STRING,
                                    string: value.string.split(searchTextRegex).join(replace),
                                };
                            }
                            else if (value.expression && searchTextRegex.test(value.expression)) {
                                const expressionParts = toExpressionParts(value.expression);
                                const lastExpressionString = expressionParts.string;
                                const nextExpressionString = lastExpressionString
                                    .split(PART_SUBSTITUTION)
                                    .map((string) => {
                                        return searchTextRegex.test(string)
                                            ? string.split(searchTextRegex).join(replace)
                                            : string;
                                    })
                                    .join(PART_SUBSTITUTION);
                                if (lastExpressionString !== nextExpressionString) {
                                    return {
                                        type: VALUE_TYPE_STRING,
                                        expression: fromExpressionParts(expressionParts, nextExpressionString),
                                    };
                                }
                            }
                            break;
                    }
                }
                else if (searchParameters.nodeValueVariableName) {
                    const searchKey = getVariableKey(search);
                    const replaceExpression = (expression) => {
                        if (expression.startsWith('$') && searchVariableNameRegex.test(expression)) {
                            const [variableName, ...parts] = getExpressionParts(expression);
                            if (getVariableKey(variableName) === searchKey) {
                                return `$${[replace, ...parts.map(replaceExpression)].join('')}$`;
                            }
                            if (parts.length > 0) {
                                return `$${[variableName, ...parts.map(replaceExpression)].join('')}$`;
                            }
                        }
                        return expression;
                    };

                    switch (value.type) {
                        case VALUE_TYPE_VARIABLE:
                            if (!value.packageName && getVariableKey(value.variableName) === searchKey) {
                                return {
                                    type: VALUE_TYPE_VARIABLE,
                                    variableName: replace,
                                };
                            }
                            break;
                        default:
                            if (value.expression && searchVariableNameRegex.test(value.expression)) {
                                const expressionParts = toExpressionParts(value.expression);
                                expressionParts.expressions = expressionParts.expressions.map(replaceExpression);
                                const nextExpression = fromExpressionParts(expressionParts, expressionParts.string);
                                if (value.expression !== nextExpression) {
                                    return {
                                        type: value.type,
                                        expression: nextExpression,
                                    };
                                }
                            }
                            break;
                    }
                }
                return value;
            };
            const replaceNodeValues = (nodes) => {
                return replaceNodesDeep(
                    nodes,
                    (nodes) => nodes.map((lastNode) => {
                        const matches = nodeReplaceMap.get(lastNode.uid);
                        if (!matches?.length) {
                            return lastNode;
                        }
                        let changed = false;
                        const nextNode = structuredClone(lastNode);
                        matches.forEach((match) => {
                            if (!replaceSelection.has(`${lastNode.uid}@${match.path}`)) {
                                return;
                            }
                            const lastValue = _get(nextNode, match.path);
                            const nextValue = replaceValue(lastValue);
                            if (lastValue !== nextValue) {
                                _set(nextNode, match.path, nextValue);
                                changed = true;
                            }
                        });
                        return changed ? nextNode : lastNode;
                    }),
                );
            };
            const lastNodes = getFieldValue('nodes');
            const lastOrphans = getFieldValue('orphans');
            const lastTriggers = getFieldValue('triggers');
            const nextNodes = replaceNodeValues(lastNodes);
            const nextOrphans = getNextOrphans(lastOrphans, (nodes) => replaceNodeValues(nodes));
            const nextTriggers = replaceNodeValues(lastTriggers);
            if (lastNodes !== nextNodes || lastTriggers !== nextTriggers) {
                const {undo} = this.state;
                const packages = getFieldValue('packages');
                const packageSettings = getFieldValue('packageSettings');
                const variables = getFieldValue('variables');
                const workItemTemplateName = getFieldValue('workItemTemplateName');
                const lastSwimlanes = getFieldValue('swimlanes');
                const swimlaneStacking = getFieldValue('swimlaneStacking');
                this.setState({
                    undo: [
                        {
                            packages,
                            packageSettings,
                            triggers: lastTriggers,
                            nodes: lastNodes,
                            orphans: lastOrphans,
                            swimlanes: lastSwimlanes,
                            swimlaneStacking,
                            variables,
                            workItemTemplateName,
                            type: CHANGE_TYPE_NODE,
                        },
                        ...undo,
                    ].slice(0, MAXIMUM_UNDO_REDO),
                    redo: [],
                }, () => {
                    if (
                        lastTriggers !== nextTriggers ||
                        lastNodes !== nextNodes ||
                        lastOrphans !== nextOrphans
                    ) {
                        if (getAutomationTypeHasCanvasProcess(automationType)) {
                            const {packageDetails} = this.props;
                            const {triggers, nodes, orphans, swimlanes} = getNodesWithLayout(
                                packageDetails,
                                {
                                    triggers: lastTriggers,
                                    nodes: lastNodes,
                                    orphans: lastOrphans,
                                    swimlanes: lastSwimlanes,
                                },
                                {
                                    triggers: nextTriggers,
                                    nodes: nextNodes,
                                    orphans: nextOrphans,
                                    swimlanes: lastSwimlanes,
                                },
                                swimlaneStacking,
                                this.getProcessLayoutConfig(),
                            );
                            if (triggers !== lastTriggers) {
                                change('triggers', triggers);
                            }
                            if (nodes !== lastNodes) {
                                change('nodes', nodes);
                            }
                            if (orphans !== lastOrphans) {
                                change('orphans', orphans);
                            }
                            if (swimlanes !== lastSwimlanes) {
                                change('swimlanes', swimlanes);
                            }
                        }
                        else {
                            if (lastTriggers !== nextTriggers) {
                                change('triggers', nextTriggers);
                            }
                            if (nextNodes !== lastNodes) {
                                change('nodes', nextNodes);
                            }
                            if (nextOrphans !== lastOrphans) {
                                change('orphans', nextOrphans);
                            }
                        }
                    }
                    this.dirty();
                });

                actions.toastCreate({
                    title: t('taskbot:assistant-replace-toast-title'),
                    message: t('taskbot:assistant-replace-toast-message', {count: replaceSelection.size}),
                });
            }
        });
    };

    handleAssistantToggle = () => {
        this.setState(({assistantShow}) => ({
            assistantShow: !assistantShow,
        }));
    };

    handleAssistantHide = () => {
        this.setState({assistantShow: false});
    };

    handleAssistantStyle = (assistantStyle) => {
        const nextAssistantStyle = !assistantStyle
            ? null
            : typeof assistantStyle === 'function'
                ? assistantStyle(this.state.assistantStyle)
                : assistantStyle;
        if (!isEqual(this.state.assistantStyle, nextAssistantStyle)) {
            this.setState({
                assistantStyle: nextAssistantStyle,
            }, () => {
                clearTimeout(this.timeoutSaveAssistantPosition);
                if (assistantStyle) {
                    this.timeoutSaveAssistantPosition = setTimeout(() => {
                        const {actions} = this.props;
                        actions.uiPreferencesSave(SCOPE_BOT_EDITOR, {
                            values : {
                                [BOT_EDITOR_ASSISTANT_STYLE_DOCK_TO]: nextAssistantStyle.dockedTo ?? 'NONE',
                                [BOT_EDITOR_ASSISTANT_STYLE_TOP]: String(nextAssistantStyle.insetBlockStart ?? nextAssistantStyle.top),
                                [BOT_EDITOR_ASSISTANT_STYLE_LEFT]: String(nextAssistantStyle.insetInlineStart ?? nextAssistantStyle.left),
                                [BOT_EDITOR_ASSISTANT_STYLE_HEIGHT]: String(nextAssistantStyle.blockSize ?? nextAssistantStyle.height),
                                [BOT_EDITOR_ASSISTANT_STYLE_WIDTH]: String(nextAssistantStyle.inlineSize ?? nextAssistantStyle.width),
                            },
                        });
                    }, 500);
                }
            });
        }
    };

    handleAssistantPageChange = (assistantPage) => {
        this.setState({assistantPage});
    };

    handleAssistantPageOpen = (assistantPage) => {
        this.setState({assistantShow: true, assistantPage});
    };

    handleKeyboardBindingToggle = () => {
        this.setState(({showKeyBindings}) => ({
            showKeyBindings: !showKeyBindings,
        }));
    };

    handleSizeChange = (size) => {
        clearTimeout(this.sizeTimeout);
        this.sizeTimeout = setTimeout(() => {
            const {sizes, collapsed} = this.state;
            let nextSizes = sizes;
            let nextCollapsed = collapsed;
            // shrink sizes when we enter a smaller screen
            if (size === 'xs' || size === 'sm') {
                if (sizes.get(KEY_PALETTE) > SIZE_PALETTE_MINIMUM) {
                    nextSizes = nextSizes.set(KEY_PALETTE, SIZE_PALETTE_MINIMUM).clone();
                }
                if (sizes.get(KEY_DETAILS) > SIZE_DETAILS_MINIMUM) {
                    nextSizes = nextSizes.set(KEY_DETAILS, SIZE_DETAILS_MINIMUM).clone();
                }
            }
            // grow to defaults when we enter a larger screen
            else {
                if (sizes.get(KEY_PALETTE) > 0 && sizes.get(KEY_PALETTE) < SIZE_PALETTE_DEFAULT) {
                    nextSizes = nextSizes.set(KEY_PALETTE, SIZE_PALETTE_DEFAULT).clone();
                }
                if (sizes.get(KEY_DETAILS) > 0 && sizes.get(KEY_DETAILS) < SIZE_DETAILS_DEFAULT) {
                    nextSizes = nextSizes.set(KEY_DETAILS, SIZE_DETAILS_DEFAULT).clone();
                }
            }
            // go from dual to flow when we enter a smaller screen
            if (size === 'xs' || size === 'sm' || size === 'md') {
                const showFlow = !collapsed.has(KEY_CANVAS_FLOW);
                const showList = !collapsed.has(KEY_CANVAS_LIST);
                if (showFlow && showList) {
                    nextCollapsed = nextCollapsed.add(KEY_CANVAS_LIST).clone();
                }
            }
            // go back to dual if we had that open previously
            else {
                const {lastEditorCanvas} = this.state;
                if (lastEditorCanvas === 'both') {
                    nextCollapsed = nextCollapsed.remove(KEY_CANVAS_FLOW).remove(KEY_CANVAS_LIST).clone();
                }
            }
            if (sizes !== nextSizes || collapsed !== nextCollapsed) {
                this.setState({sizes: nextSizes, collapsed: nextCollapsed});
            }
        }, 50);
    };

    handleEditorPageClick = () => {
        clearTimeout(this.pageClickTimeout);
        this.pageClickTimeout = setTimeout(() => {
            this.handleApplyNodeDetails(() => {});
        }, 100);
    };

    handleSaveAsCopy = () => {
        if (!this._isMounted) {
            return;
        }
        const {automationFile} = this.props;
        this.handleCheckUnsaved(() => {
            this.setState({
                fileSaveAs: automationFile?.type,
            });
        }, {
            silent: false,
        });
    };

    handleSaveAsTemplate = () => {
        if (!this._isMounted) {
            return;
        }
        const {automationType} = this.props;
        this.handleCheckUnsaved(() => {
            this.setState({
                fileSaveAs: automationType === FILE_TYPE_PROCESS
                    ? FILE_TYPE_PROCESS_TEMPLATE
                    : FILE_TYPE_TASKBOT_TEMPLATE,
            });
        }, {
            silent: false,
        });
    };

    handleFileEditShow = () => {
        if (!this._isMounted) {
            return;
        }
        this.handleCheckUnsaved(() => {
            this.setState({fileEditShow: true});
        }, {
            silent: true,
        });
    };

    handleFileEditCancel = () => {
        if (!this._isMounted) {
            return;
        }
        this.setState({
            fileEditShow: false,
        });
    };

    handleFileEditSubmit = async(file) => {
        if (!this._isMounted) {
            return;
        }
        await new Promise((resolve, reject) => {
            const {workspaceName, automationType, automationFile, automationReport, actions} = this.props;
            let hasErrors = false;
            if (getAutomationTypeHasErrors(automationType)) {
                hasErrors = automationReport.hasErrors;
            }
            actions.repositoriesUpdateFile(workspaceName, {...automationFile, ...file}, null, null, hasErrors, resolve, reject);
        });
        this.setState({
            fileEditShow: false,
        });
    };

    handleSaveAsDone = (file) => {
        if (!this._isMounted) {
            return;
        }
        const {actions} = this.props;
        this.setState({
            fileSaveAs: null,
        }, () => {
            if (file) {
                switch (file.type) {
                    case FILE_TYPE_TASKBOT_TEMPLATE:
                        actions.pagesNavigate(`/bots/repository/private/files/task/${file.id}/edit`);
                        break;
                    case FILE_TYPE_PROCESS_TEMPLATE:
                        actions.pagesNavigate(`/bots/repository/private/files/process/${file.id}/edit`);
                        break;
                    case FILE_TYPE_AI_AGENT_TEMPLATE:
                        actions.pagesNavigate(`/bots/repository/private/files/aiagent/${file.id}/edit`);
                        break;
                }
            }
        });
    };

    handleSaveAsHide = () => {
        if (!this._isMounted) {
            return;
        }
        this.setState({
            fileSaveAs: null,
        });
    };

    handleCredentialsCheck = (credentialsCallback) => {
        if (!this._isMounted) {
            return;
        }
        this.setState({
            credentialsShow: true,
            credentialsCallback,
        });
    };

    handleCredentialsConfirm = () => {
        if (!this._isMounted) {
            return;
        }
        const {credentialsCallback} = this.state;
        this.setState({
            credentialsShow: false,
            credentialsCallback: null,
        }, credentialsCallback);
    };

    handleCredentialsCancel = () => {
        if (!this._isMounted) {
            return;
        }
        this.setState({
            credentialsShow: false,
            credentialsCallback: null,
        });
    };

    handleResize = (name, value) => {
        if (!this._isMounted) {
            return;
        }
        const {sizes} = this.state;
        this.setState({
            sizes: sizes.set(name, value).clone(),
        }, () => {
            if (name === KEY_PALETTE || name === KEY_DETAILS) {
                clearTimeout(this.timeoutSaveSizes);
                this.timeoutSaveCanvas = setTimeout(() => {
                    const {actions} = this.props;
                    actions.uiPreferencesSave(SCOPE_BOT_EDITOR, {
                        values : {
                            [BOT_EDITOR_SIZE_PALETTE]: String(sizes.get(KEY_PALETTE)),
                            [BOT_EDITOR_SIZE_DETAILS]: String(sizes.get(KEY_DETAILS)),
                        },
                    });
                }, 500);
            }
        });
    };

    handleGroupsChange = (groups) => {
        if (!this._isMounted) {
            return;
        }

        if (this.state.groups !== groups) {
            this.setState({groups});
        }
    };

    handleCollapsedChange = (collapsed) => {
        if (!this._isMounted) {
            return;
        }
        if (this.state.collapsed !== collapsed) {
            const {lastEditorCanvas} = this.state;
            const showFlow = !collapsed.has(KEY_CANVAS_FLOW);
            const showList = !collapsed.has(KEY_CANVAS_LIST);
            const nextEditorCanvas = showFlow && showList ? 'both' : showList ? 'list' : 'flow';
            this.setState({collapsed, lastEditorCanvas: nextEditorCanvas}, () => {
                const {actions} = this.props;
                if (nextEditorCanvas !== lastEditorCanvas) {
                    clearTimeout(this.timeoutSaveCanvas);
                    this.timeoutSaveCanvas = setTimeout(() => {
                        actions.uiPreferencesSave(SCOPE_BOT_EDITOR, {values : {[BOT_EDITOR_CANVAS_VIEW]: nextEditorCanvas}});
                    }, 500);
                }
            });
        }
    };

    handleEditorCanvasModeChange = (value) => {
        const {cursor, collapsed} = this.state;
        switch (value) {
            case 'flow':
                this.handleCollapsedChange(collapsed
                    .remove(KEY_CANVAS_FLOW)
                    .add(KEY_CANVAS_LIST)
                    .clone(),
                );
                if (cursor) {
                    this.handleCursorChange({
                        ...cursor,
                        view: KEY_CANVAS_FLOW,
                    });
                }

                break;
            case 'list':
                this.handleCollapsedChange(collapsed
                    .add(KEY_CANVAS_FLOW)
                    .remove(KEY_CANVAS_LIST)
                    .clone(),
                );
                if (cursor) {
                    this.handleCursorChange({
                        ...cursor,
                        view: KEY_CANVAS_LIST,
                    });
                }
                break;
            case 'both':
                this.handleCollapsedChange(collapsed
                    .remove(KEY_CANVAS_FLOW)
                    .remove(KEY_CANVAS_LIST)
                    .clone(),
                );
                break;
        }
    };

    handleOpenedChange = (opened) => {
        if (!this._isMounted) {
            return;
        }
        if (this.state.opened !== opened) {
            this.setState({opened});
        }
    };

    handleCursorChange = (nextCursor) => {
        if (!this._isMounted) {
            return;
        }
        const handleCursor = () => {
            if (this.state.cursor !== nextCursor && !isEqual(this.state.cursor, nextCursor)) {
                this.setState({cursor: nextCursor});
            }
        };
        if (this.state.tabId === 'editor') {
            handleCursor();
        }
        else {
            this.setState({tabId: 'editor'}, handleCursor);
        }
    };

    handleCopy = (clipboard) => {
        if (!this._isMounted) {
            return;
        }
        if (this.state.clipboard !== clipboard) {
            this.setState({clipboard});
        }
    };

    handleGlobalMetadataCopy = (globalClipboard, onDone) => {
        const {automationFile, packageDetails, globalValues, variableMap} = this.props;
        if (!automationFile || globalClipboard.sourceFileId === automationFile.id) {
            onDone();
            return;
        }
        const metadataSet = new Set();
        const addMetadataPath = (path) => {
            if (path) {
                metadataSet.add(path);
            }
        };
        const addCaptureMetadataPaths = (capture) => {
            if (capture && !capture.secureRecorded) {
                addMetadataPath(capture.screenshotMetadataPath);
                addMetadataPath(capture.thumbnailMetadataPath);
            }
        };
        const getValueMetadata = (value) => {
            switch (value?.type) {
                case VALUE_TYPE_IMAGE:
                    addMetadataPath(value.screenshotMetadataPath);
                    addMetadataPath(value.thumbnailMetadataPath);
                    break;
                case VALUE_TYPE_COORDINATE:
                    addCaptureMetadataPaths(value.coordinate?.capture);
                    break;
                case VALUE_TYPE_REGION:
                    addCaptureMetadataPaths(value.region?.capture);
                    break;
                case VALUE_TYPE_UIOBJECT:
                    addCaptureMetadataPaths(value.uiObject?.capture);
                    addCaptureMetadataPaths(value.uiObjectAnchor?.uiObject?.capture);
                    break;
            }
        };
        if (globalClipboard.nodes?.length > 0) {
            const taskAliases = [];
            getNodeSet(null, getValueMetadata, globalClipboard.nodes, metadataSet, globalValues, taskAliases, variableMap, packageDetails.commandMap, packageDetails.commandProperties, (s) => s);
        }
        if (!metadataSet.size) {
            onDone();
            return;
        }
        this.setState({
            copyMetadata: {
                sourceFileId: globalClipboard.sourceFileId,
                sourceMetadataPaths: [...metadataSet],
                targetFileId: automationFile.id,
                onDone: () => {
                    this.setState({
                        copyMetadata: null,
                    }, onDone);
                },
            },
        });
    };

    handleGlobalCopy = (clipboard) => {
        if (!this._isMounted) {
            return;
        }
        if (!clipboard) {
            return;
        }
        const {workspaceName, automationFile, packageDetails, taskAliases, globalValues, getFieldValue, actions, t} = this.props;
        if (!automationFile || workspaceName !== WORKSPACE_PRIVATE) {
            return;
        }
        const variables = getFieldValue('variables');
        const {packageMap, commandMap, commandProperties} = packageDetails;
        const variableMap = getVariableMap(packageDetails.variableGroups, packageDetails.variableMap, variables);
        const usedPackageSet = new Set();
        if (clipboard.nodes?.length > 0) {
            getNodeSet(getNodePackageNames, getNodeValuePackageNames, clipboard.nodes, usedPackageSet, globalValues, taskAliases, variableMap, commandMap, commandProperties, (s) => s);
        }
        const usedVariableSet = new Set();
        if (clipboard.nodes?.length > 0) {
            getNodeSet(null, getNodeValueVariables, clipboard.nodes, usedVariableSet, globalValues, taskAliases, variableMap, commandMap, commandProperties, (s) => s);
        }
        if (clipboard.variables?.length > 0) {
            clipboard.variables.forEach((variable) => {
                usedVariableSet.add(getVariableKey(variable.name));
            });
        }
        const globalClipboardVariables = variables.filter((variable) => usedVariableSet.has(getVariableKey(variable.name)));
        globalClipboardVariables.forEach((variable) => {
            if (variable.type === VALUE_TYPE_SESSION && variable.sessionType) {
                usedPackageSet.add(variable.sessionType);
            }
        });
        // Set up the global clipboard
        const globalClipboardUid = generateUUID();
        const globalClipboard = {
            uid: globalClipboardUid,
            sourceFileId: automationFile.id,
            sourceWorkspaceName: workspaceName,
            nodes: clipboard.nodes,
            variables: globalClipboardVariables,
            packages: [...usedPackageSet].map((key) => packageMap[key]).filter(Boolean).map(({name, packageVersion: version}) => ({name, version})),
        };
        toLocalStorage('globalClipboardUid', globalClipboardUid);
        toLocalStorage('globalClipboard', globalClipboard);
        this.setState({globalClipboardUid});
        actions.toastCreate({
            title: t('taskbot:toast-clipboardcopy-title'),
            message: t('taskbot:toast-clipboardcopy-copy-message'),
        });
    };

    handleGlobalPaste = (onPaste) => {
        if (!this._isMounted) {
            return;
        }
        const globalClipboard = this.selectGlobalClipboard(this.props, this.state);
        if (!globalClipboard) {
            return;
        }
        const {automationType, packages, globalValues, packageDetails, getFieldValue} = this.props;
        const lastVariables = getFieldValue('variables');
        const lastPackages = getFieldValue('packages');
        let nextVariables = lastVariables;
        let nextPackages = lastPackages;
        const conflicts = [];
        clearTimeout(this.pageClickTimeout);
        this.handleApplyNodeDetails(() => {
            // Check for package conflicts and merge duplicates
            if (globalClipboard.packages?.length > 0) {
                const {commandMap, commandProperties} = packageDetails;
                const variableMap = getVariableMap(packageDetails.variableGroups, packageDetails.variableMap, nextVariables);
                const nodes = getFieldValue('nodes');
                const triggers = getFieldValue('triggers');
                const taskAliases = getTaskAliases(automationType, nodes, packageDetails, (s) => s);
                const usedPackageSet = new Set();
                getNodeSet(getNodePackageNames, getNodeValuePackageNames, nodes, usedPackageSet, globalValues, taskAliases, variableMap, commandMap, commandProperties, (s) => s);
                getNodeSet(getNodePackageNames, getNodeValuePackageNames, triggers, usedPackageSet, globalValues, taskAliases, variableMap, commandMap, commandProperties, (s) => s);
                const globalClipboardPackages = globalClipboard.packages.filter(({name, version: clipboardVersion}) => {
                    if (!usedPackageSet.has(name)) {
                        return true;
                    }
                    let packageVersion;
                    const formPackage = nextPackages.find((pkg) => pkg.name === name);
                    if (formPackage) {
                        packageVersion = formPackage.version;
                    }
                    else {
                        const pkg = packages.find((pkg) => pkg.name === name);
                        if (pkg) {
                            packageVersion = pkg.packageVersion;
                        }
                    }
                    if (!packageVersion || packageVersion === clipboardVersion) {
                        return false;
                    }
                    conflicts.push({package: {name, clipboardVersion, packageVersion}});
                    return false;
                });
                if (globalClipboardPackages.length > 0) {
                    nextPackages = [...nextPackages, ...globalClipboardPackages];
                }
            }
            // Check for variable conflicts and merge duplicates
            if (globalClipboard.variables?.length > 0) {
                const globalClipboardVariables = globalClipboard.variables.filter((variable) => {
                    const key = getVariableKey(variable.name);
                    const lastVariable = lastVariables.find((variable) => getVariableKey(variable.name) === key);
                    if (variable.type === VALUE_TYPE_FORM) {
                        conflicts.push({variable, lastVariable});
                        return false;
                    }
                    if (!lastVariable) {
                        return true;
                    }
                    if (!isVariableEqual(variable, lastVariable)) {
                        conflicts.push({variable, lastVariable});
                    }
                    return false;
                });
                if (globalClipboardVariables.length > 0) {
                    nextVariables = [...nextVariables, ...globalClipboardVariables];
                }
            }
            const onConfirm = (nextVariables, nextPackages) => {
                const {actions, t} = this.props;
                if (!globalClipboard.nodes?.length) {
                    if (nextVariables && !isEqual(lastVariables, nextVariables)) {
                        actions.toastCreate({
                            title: t('taskbot:toast-clipboardcopy-title'),
                            message: t('taskbot:toast-clipboardcopy-paste-message'),
                        });
                        this.handleVariablesChange(nextVariables, null, nextPackages);
                        return;
                    }
                    actions.toastCreate({
                        title: t('taskbot:toast-clipboardcopy-title'),
                        message: t('taskbot:toast-clipboardcopy-unchanged-message'),
                    });
                    return;
                }
                this.handleGlobalMetadataCopy(globalClipboard, () => {
                    actions.toastCreate({
                        title: t('taskbot:toast-clipboardcopy-title'),
                        message: t('taskbot:toast-clipboardcopy-paste-message'),
                    });
                    onPaste(
                        globalClipboard.nodes,
                        ({nodes, triggers, orphans}) => this.handleNodesChange({
                            nodes,
                            triggers,
                            orphans,
                            variables: nextVariables,
                            packages: nextPackages,
                        }),
                        () => this.setState({
                            globalClipboardMessage: {
                                id: 'shared-clipboardpaste-empty-error',
                                theme: 'error',
                                renderTitle: () => {
                                    const {t} = this.props;
                                    return t('taskbot:shared-clipboardpaste-empty-error-title');
                                },
                                renderMessage: () => {
                                    const {t} = this.props;
                                    return t('taskbot:shared-clipboardpaste-empty-error-message');
                                },
                            },
                        }),
                    );
                });
            };
            // Throw an error if we have any conflicts
            if (conflicts.length > 0) {
                const {t} = this.props;
                const items = [];
                const variableConflicts = conflicts.filter((conflict) => conflict.variable);
                const existingVariableSet = new Set();
                if (variableConflicts.length > 0) {
                    const existingVariables = [];
                    variableConflicts.forEach(({variable, lastVariable}) => {
                        if (!variable || !lastVariable || variable.type === VALUE_TYPE_FORM) {
                            return;
                        }
                        existingVariableSet.add(getVariableKey(variable.name));
                        existingVariables.push({
                            icon: renderVariableTypeIcon(VALUE_TYPE_ICONS[variable.type]),
                            label: variable.name,
                        });
                    });
                    if (existingVariables.length > 0) {
                        items.push({header: t('taskbot:shared-clipboardpaste-conflicts-overwrite-variables-existing')}, ...existingVariables);
                        const newVariables = [];
                        globalClipboard.variables?.forEach((variable) => {
                            if (!variable || existingVariableSet.has(getVariableKey(variable.name))) {
                                return;
                            }
                            newVariables.push({
                                icon: renderVariableTypeIcon(VALUE_TYPE_ICONS[variable.type]),
                                label: variable.name,
                            });
                        });
                        if (newVariables.length > 0) {
                            items.push({header: t('taskbot:shared-clipboardpaste-conflicts-overwrite-variables-new')}, ...newVariables);
                        }
                    }
                }
                if (variableConflicts.length > 0 && variableConflicts.length === conflicts.length) {
                    this.setState({
                        globalClipboardMessage: {
                            id: 'shared-clipboardpaste-conflicts-overwrite',
                            theme: 'info',
                            overwrite: false,
                            renderTitle: () => {
                                const {t} = this.props;
                                return t('taskbot:shared-clipboardpaste-conflicts-overwrite-title');
                            },
                            renderMessage: () => {
                                const {globalClipboardMessage} = this.state;
                                return (
                                    <>
                                        <Help>
                                            {t('taskbot:shared-clipboardpaste-conflicts-overwrite-help')}
                                        </Help>
                                        <RadioInput
                                            name="global-paste-overwrite"
                                            value={!globalClipboardMessage.overwrite}
                                            onChange={() => this.setState({
                                                globalClipboardMessage: {...globalClipboardMessage, overwrite: false},
                                            })}
                                        >
                                            {t('taskbot:shared-clipboardpaste-conflicts-overwrite-option-keep')}
                                            <br/>
                                            <br/>
                                            <Help>{t('taskbot:shared-clipboardpaste-conflicts-overwrite-option-keep-help')}</Help>
                                        </RadioInput>
                                        <RadioInput
                                            name="global-paste-overwrite"
                                            value={globalClipboardMessage.overwrite}
                                            onChange={() => this.setState({
                                                globalClipboardMessage: {...globalClipboardMessage, overwrite: true},
                                            })}
                                        >
                                            {t('taskbot:shared-clipboardpaste-conflicts-overwrite-option-overwrite')}
                                            <br/>
                                            <br/>
                                            <Help>{t('taskbot:shared-clipboardpaste-conflicts-overwrite-option-overwrite-help')}</Help>
                                        </RadioInput>
                                    </>
                                );
                            },
                            items,
                            onContinue: () => {
                                const {globalClipboardMessage} = this.state;
                                this.setState({globalClipboardMessage: null}, () => {
                                    if (globalClipboardMessage.overwrite) {
                                        onConfirm(nextVariables.map((variable) => {
                                            const key = getVariableKey(variable.name);
                                            const lastVariable = globalClipboard.variables.find((variable) => getVariableKey(variable.name) === key);
                                            return lastVariable || variable;
                                        }), nextPackages);
                                    }
                                    else {
                                        onConfirm(nextVariables.map((variable) => {
                                            const key = getVariableKey(variable.name);
                                            const lastVariable = lastVariables.find((variable) => getVariableKey(variable.name) === key);
                                            return lastVariable || variable;
                                        }), nextPackages);
                                    }
                                });
                            },
                        },
                    });
                    return;
                }
                this.setState({
                    globalClipboardMessage: {
                        id: 'shared-clipboardpaste-conflicts-error',
                        theme: 'error',
                        renderTitle: () => {
                            const {t} = this.props;
                            return t('taskbot:shared-clipboardpaste-conflicts-error-title');
                        },
                        renderMessage: () => {
                            const {globalClipboardMessage} = this.state;
                            if (!globalClipboardMessage?.conflicts?.length) {
                                return null;
                            }

                            const {t, packageDetails} = this.props;
                            const {packageMap} = packageDetails;
                            const packages = globalClipboardMessage.conflicts.filter((conflict) => conflict.package);
                            const variables = globalClipboardMessage.conflicts.filter((conflict) => conflict.variable);
                            return (
                                <>
                                    {packages.length > 0 && (
                                        <>
                                            {t('taskbot:shared-clipboardpaste-conflicts-packages')}
                                            <ul>
                                                {packages.map((conflict, index) => {
                                                    const pkg = packageMap[conflict.package.name];
                                                    return (
                                                        <li key={index}>
                                                            {pkg ? pkg.label : conflict.package.name}
                                                            <ul>
                                                                <li>
                                                                    {t('taskbot:shared-clipboardpaste-conflicts-packages-current',
                                                                        {version: conflict.package.packageVersion},
                                                                    )}
                                                                </li>
                                                                <li>
                                                                    {t('taskbot:shared-clipboardpaste-conflicts-packages-target',
                                                                        {version: conflict.package.clipboardVersion},
                                                                    )}
                                                                </li>
                                                            </ul>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </>
                                    )}
                                    {variables.length > 0 && (
                                        <>
                                            {t('taskbot:shared-clipboardpaste-conflicts-variables')}
                                            <ul>
                                                {variables.map((conflict, index) => (
                                                    <li key={index}>
                                                        {conflict.variable.name}
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                </>
                            );
                        },
                        conflicts,
                    },
                });
                return;
            }

            onConfirm(nextVariables, nextPackages);
        });
    };

    handleGlobalClipboardMessageClose = () => {
        if (!this._isMounted) {
            return;
        }
        this.setState({globalClipboardMessage: null});
    };

    handlePanZoomChange = (panZoom) => {
        if (!this._isMounted) {
            return;
        }
        if (this.state.panZoom !== panZoom && !isEqual(this.state.panZoom, panZoom)) {
            this.setState({panZoom});
        }
    };

    handleUndo = () => {
        if (!this._isMounted) {
            return;
        }
        const {undo: [undone, ...undo], redo} = this.state;
        if (!undone) {
            return;
        }
        const {change, getFieldValue} = this.props;
        const packages = getFieldValue('packages');
        const packageSettings = getFieldValue('packageSettings');
        const triggers = getFieldValue('triggers');
        const nodes = getFieldValue('nodes');
        const orphans = getFieldValue('orphans');
        const swimlanes = getFieldValue('swimlanes');
        const swimlaneStacking = getFieldValue('swimlaneStacking');
        const variables = getFieldValue('variables');
        const workItemTemplateName = getFieldValue('workItemTemplateName');
        this.setState({
            undo,
            redo: [
                {
                    packages,
                    packageSettings,
                    triggers,
                    nodes,
                    swimlanes,
                    swimlaneStacking,
                    orphans,
                    variables,
                    workItemTemplateName,
                    type: undone.type,
                },
                ...redo,
            ].slice(0, MAXIMUM_UNDO_REDO),
        }, () => {
            change('packages', undone.packages);
            change('packageSettings', undone.packageSettings);
            change('triggers', undone.triggers);
            change('nodes', undone.nodes);
            change('orphans', undone.orphans);
            change('swimlanes', undone.swimlanes);
            change('swimlaneStacking', undone.swimlaneStacking);
            change('variables', undone.variables);
            change('workItemTemplateName', undone.workItemTemplateName);
            this.dirty();
        });
    };

    handleRedo = () => {
        if (!this._isMounted) {
            return;
        }
        const {undo, redo: [redone, ...redo]} = this.state;
        if (!redone) {
            return;
        }
        const {change, getFieldValue} = this.props;
        const packages = getFieldValue('packages');
        const packageSettings = getFieldValue('packageSettings');
        const triggers = getFieldValue('triggers');
        const nodes = getFieldValue('nodes');
        const orphans = getFieldValue('orphans');
        const swimlanes = getFieldValue('swimlanes');
        const swimlaneStacking = getFieldValue('swimlaneStacking');
        const variables = getFieldValue('variables');
        const workItemTemplateName = getFieldValue('workItemTemplateName');
        this.setState({
            undo: [
                {
                    packages,
                    packageSettings,
                    triggers,
                    nodes,
                    orphans,
                    swimlanes,
                    swimlaneStacking,
                    variables,
                    workItemTemplateName,
                    type: redone.type,
                },
                ...undo,
            ],
            redo,
        }, () => {
            if (redone.packageSettingsValues) {
                Object.entries(redone.packageSettingsValues).forEach(([name, value]) => change(name, value));
            }
            change('packages', redone.packages);
            change('packageSettings', redone.packageSettings);
            change('triggers', redone.triggers);
            change('nodes', redone.nodes);
            change('orphans', redone.orphans);
            change('swimlanes', redone.swimlanes);
            change('swimlaneStacking', redone.swimlaneStacking);
            change('variables', redone.variables);
            change('workItemTemplateName', redone.workItemTemplateName);
            this.dirty();
        });
    };

    handleProcessCodeVersionChange = (nextValue, details) => {
        if (!this._isMounted) {
            return;
        }
        const {undo} = this.state;
        const {packageDetails, change, getFieldValue} = this.props;
        const lastValue = details.value;
        const lastTriggers = getFieldValue('triggers');
        const lastNodes = getFieldValue('nodes');
        const lastOrphans = getFieldValue('orphans');
        const lastSwimlanes = getFieldValue('swimlanes');
        const lastSwimlaneStacking = getFieldValue('swimlaneStacking');
        const lastVariables = getFieldValue('variables');
        const lastWorkItemTemplateName = getFieldValue('workItemTemplateName');
        const lastPackages = getFieldValue('packages');
        const lastPackageSettings = getFieldValue('packageSettings');
        const lastProperties = getFieldValue('properties');
        const nextProperties = {
            ...lastProperties,
            processCodeVersion: nextValue,
        };
        let nextPackages = lastPackages;
        const isLastLegacyPackages = ['0', '1'].includes(lastValue);
        const isNextLegacyPackages = ['0', '1'].includes(nextValue);
        // Set all packages to wildcard versions
        if (!isLastLegacyPackages && isNextLegacyPackages) {
            nextPackages = lastPackages.map(({name}) => ({
                name,
                version: '*',
            }));
        }
        // Set all packages to current exact versions
        else if (isLastLegacyPackages && !isNextLegacyPackages) {
            const lastPackages = getFieldValue('packages');
            nextPackages = lastPackages.map(({name, version}) => ({
                name,
                version: packageDetails.packageMap[name]?.packageVersion || version,
            }));
        }

        this.setState({
            undo: [
                {
                    packages: lastPackages,
                    packageSettings: lastPackageSettings,
                    triggers: lastTriggers,
                    nodes: lastNodes,
                    orphans: lastOrphans,
                    swimlanes: lastSwimlanes,
                    swimlaneStacking: lastSwimlaneStacking,
                    variables: lastVariables,
                    workItemTemplateName: lastWorkItemTemplateName,
                    type: CHANGE_TYPE_SETTINGS,
                },
                ...undo,
            ].slice(0, MAXIMUM_UNDO_REDO),
            redo: [],
        }, () => {
            const {actions} = this.props;
            change('properties', nextProperties);
            if (nextPackages !== lastPackages) {
                change('packages', nextPackages);
            }
            if (!isLastLegacyPackages && isNextLegacyPackages) {
                actions.packagesGetTaskbotVersions(PROCESS_LEGACY_PACKAGES, true);
            }
            else if (isLastLegacyPackages && !isNextLegacyPackages) {
                actions.packagesGetTaskbotVersions([], false);
            }
            this.dirty();
        });
    };

    handlePackagesMigrationChange = (nextPackages, lastPackageVersion, nextPackageVersion) => {
        if (!this._isMounted) {
            return;
        }
        const {automationType, change, getFieldValue, featureFlags, licenseFlags, hasFeatureCloudTriggers, hasFeatureProcessWebTriggers} = this.props;
        const lastPackages = getFieldValue('packages');
        if (lastPackages === nextPackages) {
            return;
        }
        const {undo} = this.state;
        const lastPackageSettings = getFieldValue('packageSettings');
        const lastTriggers = getFieldValue('triggers');
        const lastNodes = getFieldValue('nodes');
        const lastOrphans = getFieldValue('orphans');
        const lastSwimlanes = getFieldValue('swimlanes');
        const lastSwimlaneStacking = getFieldValue('swimlaneStacking');
        const lastVariables = getFieldValue('variables');
        const lastWorkItemTemplateName = getFieldValue('workItemTemplateName');
        let nextTriggers = lastTriggers;
        let nextNodes = lastNodes;
        let nextPackageSettings = lastPackageSettings;
        if (lastPackageVersion && nextPackageVersion) {

            const objectMap = new Map();
            const getObject = (pkg, type, name) => {
                const key = `${pkg.packageVersion}#${type}#${name}`;
                let result = objectMap.get(key);
                if (result === undefined) {
                    result = pkg[type]?.find((object) => object.name === name) || null;
                    objectMap.set(key, result);
                }
                return result;
            };

            const attributeLists = new Map();
            const getObjectAttributeList = (pkg, type, name) => {
                const key = `${pkg.packageVersion}#${type}#${name}`;
                let result = attributeLists.get(key);
                if (!result) {
                    const object = getObject(pkg, type, name);
                    result = object?.attributes;
                    attributeLists.set(key, result);
                }
                return result || [];
            };
            // get the attributes for a trigger/command/etc
            const attributeMaps = new Map();
            const getObjectAttributeMap = (pkg, type, name) => {
                const key = `${pkg.packageVersion}#${type}#${name}`;
                let result = attributeMaps.get(key);
                if (!result) {
                    const object = getObject(pkg, type, name);
                    result = getPackageAttributeMap(object?.attributes) || {};
                    attributeMaps.set(key, result);
                }
                return result || {};
            };
            const getMigrateAttributes = (nodeAttributes, lastAttributeMap) => {
                const nodeAttributeMap = new Map();
                if (nodeAttributes) {
                    nodeAttributes.forEach((attribute, index) => nodeAttributeMap.set(attribute.name, {attribute, value: attribute.value, index}));
                }
                const migrateAttributes = (attributes, result) => {
                    if (attributes?.length > 0) {
                        attributes.forEach((nextAttribute) => {
                            const lastAttribute = lastAttributeMap[nextAttribute.name];
                            const nodeEntry = nodeAttributeMap.get(nextAttribute.name);
                            let nextValue = nodeEntry?.value;
                            if (!lastAttribute) {
                                nextValue = nextAttribute.defaultValue;
                                if (nextValue) {
                                    const nextNodeAttribute = {
                                        ...nodeEntry?.attribute,
                                        name: nextAttribute.name,
                                        value: nextValue,
                                    };
                                    if (!nodeEntry) {
                                        if (!result.attributes) {
                                            result.attributes = [];
                                        }
                                        else if (result.attributes === nodeAttributes) {
                                            result.attributes = [...nodeAttributes];
                                        }
                                        result.attributes.push(nextNodeAttribute);
                                    }
                                    else if (nodeEntry && nodeEntry.value !== nextValue) {
                                        if (result.attributes === nodeAttributes) {
                                            result.attributes = [...nodeAttributes];
                                        }
                                        result.attributes[nodeEntry.index] = nextNodeAttribute;
                                    }
                                }
                            }
                            switch (nextAttribute.type) {
                                case PACKAGE_ATTRIBUTE_TYPE_SELECT:
                                case PACKAGE_ATTRIBUTE_TYPE_RADIO:
                                    if (nextValue?.type === VALUE_TYPE_STRING && nextValue.string) {
                                        const option = nextAttribute.options?.find((option) => option.value === nextValue.string);
                                        if (option) {
                                            migrateAttributes(option.attributes, result);
                                        }
                                    }
                                    break;
                                case PACKAGE_ATTRIBUTE_TYPE_CHECKBOX:
                                    if (nextValue?.type === VALUE_TYPE_BOOLEAN && nextValue.boolean) {
                                        migrateAttributes(nextAttribute.attributes, result);
                                    }
                                    break;
                                case PACKAGE_ATTRIBUTE_TYPE_FORM_ELEMENT:
                                    if (nextValue?.type === VALUE_TYPE_FORMELEMENT && nextValue.formElementType) {
                                        const option = nextAttribute.options.find((option) => option.value === nextValue.formElementType);
                                        if (option) {
                                            migrateAttributes(option.attributes, result);
                                        }
                                    }
                                    break;
                                case PACKAGE_ATTRIBUTE_TYPE_UI_OBJECT:
                                    if (nextValue?.type === VALUE_TYPE_UIOBJECT && nextValue.uiObject) {
                                        const option = nextAttribute.options?.find(NodeFormUtilities.UiObject.getOptionTest(nextValue.uiObject));
                                        if (option) {
                                            migrateAttributes(option.attributes, result);
                                        }
                                    }
                                    break;
                                case PACKAGE_ATTRIBUTE_TYPE_TABS:
                                    nextAttribute.options?.forEach((option) => migrateAttributes(option.attributes, result));
                                    break;
                                case PACKAGE_ATTRIBUTE_TYPE_TREE:
                                case PACKAGE_ATTRIBUTE_TYPE_WINDOW:
                                case PACKAGE_ATTRIBUTE_TYPE_GROUP:
                                    migrateAttributes(nextAttribute.attributes, result);
                                    break;
                            }
                        });
                    }
                };
                return (nextAttributes) => {
                    const result = {attributes: nodeAttributes};
                    migrateAttributes(nextAttributes, result);
                    return result.attributes;
                };
            };
            const getAttributesLastNext = (scope) => {
                let lastAttributeMap;
                let nextAttributeMap;
                let nextAttributes;
                let lastObject;
                let nextObject;
                if (scope?.packageName === nextPackageVersion.name) {
                    if (scope.triggerName) {
                        lastObject = getObject(lastPackageVersion, 'triggers', scope.triggerName);
                        nextObject = getObject(nextPackageVersion, 'triggers', scope.triggerName);
                        lastAttributeMap = getObjectAttributeMap(lastPackageVersion, 'triggers', scope.triggerName);
                        nextAttributeMap = getObjectAttributeMap(nextPackageVersion, 'triggers', scope.triggerName);
                        nextAttributes = getObjectAttributeList(nextPackageVersion, 'triggers', scope.triggerName);
                    }
                    else if (scope.commandName) {
                        lastObject = getObject(lastPackageVersion, 'commands', scope.commandName);
                        nextObject = getObject(nextPackageVersion, 'commands', scope.commandName);
                        lastAttributeMap = getObjectAttributeMap(lastPackageVersion, 'commands', scope.commandName);
                        nextAttributeMap = getObjectAttributeMap(nextPackageVersion, 'commands', scope.commandName);
                        nextAttributes = getObjectAttributeList(nextPackageVersion, 'commands', scope.commandName);
                    }
                    else if (scope.iteratorName) {
                        lastObject = getObject(lastPackageVersion, 'iterators', scope.iteratorName);
                        nextObject = getObject(nextPackageVersion, 'iterators', scope.iteratorName);
                        lastAttributeMap = getObjectAttributeMap(lastPackageVersion, 'iterators', scope.iteratorName);
                        nextAttributeMap = getObjectAttributeMap(nextPackageVersion, 'iterators', scope.iteratorName);
                        nextAttributes = getObjectAttributeList(nextPackageVersion, 'iterators', scope.iteratorName);
                    }
                    else if (scope.conditionalName) {
                        lastObject = getObject(lastPackageVersion, 'conditionals', scope.conditionalName);
                        nextObject = getObject(nextPackageVersion, 'conditionals', scope.conditionalName);
                        lastAttributeMap = getObjectAttributeMap(lastPackageVersion, 'conditionals', scope.conditionalName);
                        nextAttributeMap = getObjectAttributeMap(nextPackageVersion, 'conditionals', scope.conditionalName);
                        nextAttributes = getObjectAttributeList(nextPackageVersion, 'conditionals', scope.conditionalName);
                    }
                    else if (scope.exceptionName) {
                        lastObject = getObject(lastPackageVersion, 'exceptions', scope.exceptionName);
                        nextObject = getObject(nextPackageVersion, 'exceptions', scope.exceptionName);
                        lastAttributeMap = getObjectAttributeMap(lastPackageVersion, 'exceptions', scope.exceptionName);
                        nextAttributeMap = getObjectAttributeMap(nextPackageVersion, 'exceptions', scope.exceptionName);
                        nextAttributes = getObjectAttributeList(nextPackageVersion, 'exceptions', scope.exceptionName);
                    }
                }
                return {lastAttributeMap, nextAttributeMap, nextAttributes, lastObject, nextObject};
            };
            // update values relative to previous and next attributes from packages
            const updateValue = (nodeType) => (value, attributeName, parents) => {
                let nextValue = value;
                if (attributeName && parents?.length > 0) {
                    // get the nearest parent and look inside if the package reference is inside the value
                    // (node.packageName vs attribute.value.packageName)
                    let [object] = parents;
                    if (!object?.packageName || object?.value?.packageName) {
                        object = object.value;
                    }
                    const {lastAttributeMap, nextAttributeMap} = getAttributesLastNext(object, getObjectAttributeMap);
                    if (lastAttributeMap || nextAttributeMap) {
                        const lastAttribute = lastAttributeMap[attributeName];
                        const nextAttribute = nextAttributeMap[attributeName];
                        nextValue = migrateAttributeValue(nodeType, value, lastAttribute, nextAttribute);
                    }
                }
                return nextValue;
            };
            // update the node
            const updateNode = (nodeType) => (node) => {
                const {lastObject, nextObject} = getAttributesLastNext(node);
                return migrateNode(nodeType, node, lastObject, nextObject);
            };
            // update defaults when there is only a new attribute
            const updateAttributeDefaults = (node, parents) => {
                if (!node) {
                    return node;
                }
                const object = node.packageName
                    ? node
                    : node.value?.packageName
                        ? node.value
                        : parents?.[0]?.packageName
                            ? parents[0]
                            : null;
                if (!object) {
                    return node;
                }
                const {lastAttributeMap, nextAttributes} = getAttributesLastNext(object, getObjectAttributeList);
                if (!lastAttributeMap || !nextAttributes?.length) {
                    if (node.attributes?.length > 0) {
                        const nextNodeAttributes = node.attributes.map((attribute) => updateAttributeDefaults(attribute));
                        if (nextNodeAttributes.length > node.attributes.length || nextNodeAttributes.some((attribute, index) => attribute !== node.attributes[index])) {
                            return {
                                ...node,
                                attributes: nextNodeAttributes,
                            };
                        }
                    }
                    return node;
                }
                const migrateAttributes = getMigrateAttributes(node.attributes, lastAttributeMap);
                const nextNodeAttributes = migrateAttributes(nextAttributes);
                if (nextNodeAttributes?.length && nextNodeAttributes !== node.attributes) {
                    return {
                        ...node,
                        attributes: nextNodeAttributes,
                    };
                }
                return node;
            };
            nextTriggers = updateNodeValues(lastTriggers, updateValue(NODE_TYPE_TRIGGER), updateAttributeDefaults);
            nextNodes = updateNodeValues(lastNodes, updateValue(NODE_TYPE_COMMAND), updateAttributeDefaults, updateNode(NODE_TYPE_COMMAND));
            const lastPackageSettingsAttributes = getPackageSettingsAttributes(lastPackageVersion?.settingsAttributes, featureFlags, licenseFlags);
            const nextPackageSettingsAttributes = getPackageSettingsAttributes(nextPackageVersion?.settingsAttributes, featureFlags, licenseFlags);
            if (!lastPackageSettingsAttributes.length && nextPackageSettingsAttributes.length > 0) {
                // only next settings, set defaults
                const {packageDetails} = this.props;
                const defaultAttributeValues = getDefaultAttributes(
                    nextPackageSettingsAttributes,
                    packageDetails.iteratorMap, packageDetails.conditionalMap, packageDetails.triggerMap, packageDetails.exceptionMap,
                );
                const nextPackageSettingsFormValues = getInitialValues(
                    NODE_TYPE_TRIGGER,
                    defaultAttributeValues,
                    nextPackageSettingsAttributes,
                    packageDetails.iteratorMap, packageDetails.conditionalMap, packageDetails.triggerMap, packageDetails.exceptionMap,
                    [],
                    {},
                    nextPackageVersion.name,
                );
                nextPackageSettings = Object.assign({}, lastPackageSettings, nextPackageSettingsFormValues);
            }
            else if (lastPackageSettingsAttributes.length > 0) {
                // has last settings, remove
                let removed = false;
                const removedPackageSettings = {};
                const baseKey = `${nextPackageVersion.name}__`;
                Object.entries(lastPackageSettings).forEach(([key, value]) => {
                    if (!key.startsWith(baseKey)) {
                        removedPackageSettings[key] = value;
                    }
                    else {
                        removed = true;
                    }
                });
                if (removed) {
                    nextPackageSettings = removedPackageSettings;
                }
                if (nextPackageSettingsAttributes.length > 0) {
                    // has next settings, migrate + copy
                    const {packages, packageDetails, automationFile} = this.props;
                    // convert to nodeValues
                    const lastSettingsAttributes = [];
                    setNodeAttributes(NODE_TYPE_TRIGGER, lastSettingsAttributes, lastPackageSettings, lastPackageSettingsAttributes, packageDetails.iteratorMap, packageDetails.conditionalMap, packageDetails.triggerMap, packageDetails.exceptionMap, [], {}, nextPackageVersion.name);
                    // migrate
                    const lastAttributeMap = getPackageAttributeMap(lastPackageSettingsAttributes);
                    const migrateAttributes = getMigrateAttributes(lastSettingsAttributes, lastAttributeMap);
                    const nextSettingsAttributes = migrateAttributes(nextPackageSettingsAttributes);
                    // convert back to form values
                    const nextPackageDetails = getPackageDetails([nextPackageVersion, ...packages], automationFile, hasFeatureCloudTriggers, hasFeatureProcessWebTriggers);
                    const nextPackageSettingsFormValues = getInitialValues(
                        NODE_TYPE_TRIGGER,
                        nextSettingsAttributes,
                        nextPackageSettingsAttributes,
                        nextPackageDetails.iteratorMap, nextPackageDetails.conditionalMap, nextPackageDetails.triggerMap, nextPackageDetails.exceptionMap,
                        [], {}, nextPackageVersion.name,
                    );
                    nextPackageSettings = Object.assign({}, nextPackageSettings, nextPackageSettingsFormValues);
                }
            }
        }
        this.setState({
            undo: [
                {
                    packages: lastPackages,
                    packageSettings: lastPackageSettings,
                    triggers: lastTriggers,
                    nodes: lastNodes,
                    orphans: lastOrphans,
                    swimlanes: lastSwimlanes,
                    swimlaneStacking: lastSwimlaneStacking,
                    variables: lastVariables,
                    workItemTemplateName: lastWorkItemTemplateName,
                    type: CHANGE_TYPE_PACKAGE,
                },
                ...undo,
            ].slice(0, MAXIMUM_UNDO_REDO),
            redo: [],
        }, () => {
            if (nextPackageSettings !== lastPackageSettings) {
                change('packageSettings', nextPackageSettings);
            }
            change('packages', nextPackages);
            if (
                lastNodes !== nextNodes ||
                lastTriggers !== nextTriggers
            ) {
                if (getAutomationTypeHasCanvasProcess(automationType)) {
                    const {packageDetails} = this.props;
                    const {triggers, nodes, orphans, swimlanes} = getNodesWithLayout(
                        packageDetails,
                        {
                            triggers: lastTriggers,
                            nodes: lastNodes,
                            orphans: lastOrphans,
                            swimlanes: lastSwimlanes,
                        },
                        {
                            triggers: nextTriggers,
                            nodes: nextNodes,
                            orphans: lastOrphans,
                            swimlanes: lastSwimlanes,
                        },
                        lastSwimlaneStacking,
                        this.getProcessLayoutConfig(),
                    );
                    if (triggers !== lastTriggers) {
                        change('triggers', triggers);
                    }
                    if (nodes !== lastNodes) {
                        change('nodes', nodes);
                    }
                    if (orphans !== lastOrphans) {
                        change('orphans', orphans);
                    }
                    if (swimlanes !== lastSwimlanes) {
                        change('swimlanes', swimlanes);
                    }
                }
                else {
                    if (nextTriggers !== lastTriggers) {
                        change('triggers', nextTriggers);
                    }
                    if (nextNodes !== lastNodes) {
                        change('nodes', nextNodes);
                    }
                }
            }
            this.dirty();
        });
    };

    handleNodesChange = (options) => {
        if (!this._isMounted) {
            return;
        }
        const {automationType, change, getFieldValue, variableNamePattern, packageDetails} = this.props;
        const {undo} = this.state;
        const lastWorkItemTemplateName = getFieldValue('workItemTemplateName');
        const lastTriggers = getFieldValue('triggers');
        const lastNodes = getFieldValue('nodes');
        const lastOrphans = getFieldValue('orphans');
        const lastSwimlanes = getFieldValue('swimlanes');
        const lastSwimlaneStacking = getFieldValue('swimlaneStacking');
        const lastPackages = getFieldValue('packages');
        const lastPackageSettings = getFieldValue('packageSettings');
        const lastVariables = getFieldValue('variables');
        const nextPackages = options?.packages || lastPackages;
        let nextNodes = options?.nodes || lastNodes;
        const nextTriggers = options?.triggers || lastTriggers;
        const nextOrphans = options?.orphans || lastOrphans;
        const nextSwimlanes = options?.swimlanes || lastSwimlanes;
        const nextSwimlaneStacking = options?.swimlaneStacking || lastSwimlaneStacking;
        let nextVariables = options?.variables || lastVariables;
        if (getAutomationTypeHasCanvasProcess(automationType)) {
            const isVariableInputAllowed = getIsVariableInputAllowed(nextNodes?.at(0), packageDetails);
            if (!isVariableInputAllowed) {
                const filteredVariables = nextVariables.filter((variable) => !variable?.input);
                if (filteredVariables.length < nextVariables.length) {
                    nextVariables = filteredVariables;
                }
            }
        }
        else {
            [nextNodes, nextVariables] = getNodesChange(nextNodes, nextVariables, variableNamePattern);
        }
        if (
            lastNodes === nextNodes &&
            lastOrphans === nextOrphans &&
            lastSwimlanes === nextSwimlanes &&
            lastSwimlaneStacking === nextSwimlaneStacking &&
            lastTriggers === nextTriggers &&
            lastVariables === nextVariables &&
            lastPackages === nextPackages
        ) {
            return;
        }
        const getChangeType = () => {
            if (
                lastNodes !== nextNodes ||
                lastOrphans !== nextOrphans ||
                lastSwimlanes !== nextSwimlanes ||
                lastSwimlaneStacking !== nextSwimlaneStacking
            ) {
                return CHANGE_TYPE_NODE;
            }
            if (lastTriggers !== nextTriggers) {
                return CHANGE_TYPE_TRIGGER;
            }
            if (lastVariables !== nextVariables) {
                return CHANGE_TYPE_VARIABLE;
            }
            if (lastPackages !== nextPackages) {
                return CHANGE_TYPE_PACKAGE;
            }
            return CHANGE_TYPE_NODE;
        };
        this.setState({
            undo: [
                {
                    packages: lastPackages,
                    packageSettings: lastPackageSettings,
                    triggers: lastTriggers,
                    nodes: lastNodes,
                    orphans: lastOrphans,
                    swimlanes: lastSwimlanes,
                    swimlaneStacking: lastSwimlaneStacking,
                    variables: lastVariables,
                    workItemTemplateName: lastWorkItemTemplateName,
                    type: getChangeType(),
                },
                ...undo,
            ].slice(0, MAXIMUM_UNDO_REDO),
            redo: [],
        }, () => {
            if (
                lastTriggers !== nextTriggers ||
                lastNodes !== nextNodes ||
                lastOrphans !== nextOrphans ||
                lastSwimlanes !== nextSwimlanes ||
                lastSwimlaneStacking !== nextSwimlaneStacking
            ) {
                if (getAutomationTypeHasCanvasProcess(automationType)) {
                    const {packageDetails} = this.props;
                    const {triggers, nodes, orphans, swimlanes} = getNodesWithLayout(
                        packageDetails,
                        {
                            triggers: lastTriggers,
                            nodes: lastNodes,
                            orphans: lastOrphans,
                            swimlanes: lastSwimlanes,
                        },
                        {
                            triggers: nextTriggers,
                            nodes: nextNodes,
                            orphans: nextOrphans,
                            swimlanes: nextSwimlanes,
                        },
                        nextSwimlaneStacking,
                        this.getProcessLayoutConfig(),
                    );
                    if (triggers !== lastTriggers) {
                        change('triggers', triggers);
                    }
                    if (nodes !== lastNodes) {
                        change('nodes', nodes);
                    }
                    if (orphans !== lastOrphans) {
                        change('orphans', orphans);
                    }
                    if (swimlanes !== lastSwimlanes) {
                        change('swimlanes', swimlanes);
                    }
                    if (nextSwimlaneStacking !== lastSwimlaneStacking) {
                        change('swimlaneStacking', nextSwimlaneStacking);
                    }
                }
                else {
                    if (nextTriggers !== lastTriggers) {
                        change('triggers', nextTriggers);
                    }
                    if (nextNodes !== lastNodes) {
                        change('nodes', nextNodes);
                    }
                }
            }
            if (nextPackages !== lastPackages) {
                change('packages', nextPackages);
            }
            if (nextVariables !== lastVariables) {
                change('variables', nextVariables);
            }
            this.dirty();
        });
    };

    handleVariablesChange = (nextVariables, variableRename, packagesArg) => {
        if (!this._isMounted) {
            return;
        }
        const callback = () => {
            const {automationType, change, getFieldValue} = this.props;
            const lastVariables = getFieldValue('variables');
            if (lastVariables === nextVariables && !variableRename) {
                return;
            }
            const {undo} = this.state;
            const lastPackages = getFieldValue('packages');
            const lastPackageSettings = getFieldValue('packageSettings');
            const lastTriggers = getFieldValue('triggers');
            const lastNodes = getFieldValue('nodes');
            const lastOrphans = getFieldValue('orphans');
            const lastSwimlanes = getFieldValue('swimlanes');
            const lastSwimlaneStacking = getFieldValue('swimlaneStacking');
            const lastWorkItemTemplateName = getFieldValue('workItemTemplateName');
            let nextNodes = lastNodes;
            let nextOrphans = lastOrphans;
            let nextTriggers = lastTriggers;
            if (variableRename) {
                const [nextVariableName, lastVariableName] = variableRename;
                const updateValue = getVariableReferenceUpdateValue(nextVariableName, lastVariableName);
                nextNodes = updateNodeValues(lastNodes, updateValue);
                nextOrphans = getNextOrphans(lastOrphans, (nodes) => updateNodeValues(nodes, updateValue));
                nextTriggers = updateNodeValues(lastTriggers, updateValue);
            }
            const nextPackages = packagesArg || lastPackages;
            this.setState({
                undo: [
                    {
                        packages: lastPackages,
                        packageSettings: lastPackageSettings,
                        triggers: lastTriggers,
                        nodes: lastNodes,
                        orphans: lastOrphans,
                        swimlanes: lastSwimlanes,
                        swimlaneStacking: lastSwimlaneStacking,
                        variables: lastVariables,
                        workItemTemplateName: lastWorkItemTemplateName,
                        type: CHANGE_TYPE_VARIABLE,
                    },
                    ...undo,
                ].slice(0, MAXIMUM_UNDO_REDO),
                redo: [],
            }, () => {
                if (
                    lastTriggers !== nextTriggers ||
                    lastNodes !== nextNodes ||
                    lastOrphans !== nextOrphans
                ) {
                    if (getAutomationTypeHasCanvasProcess(automationType)) {
                        const {packageDetails} = this.props;
                        const {triggers, nodes, orphans, swimlanes} = getNodesWithLayout(
                            packageDetails,
                            {
                                triggers: lastTriggers,
                                nodes: lastNodes,
                                orphans: lastOrphans,
                                swimlanes: lastSwimlanes,
                            },
                            {
                                triggers: nextTriggers,
                                nodes: nextNodes,
                                orphans: nextOrphans,
                                swimlanes: lastSwimlanes,
                            },
                            lastSwimlaneStacking,
                            this.getProcessLayoutConfig(),
                        );
                        if (triggers !== lastTriggers) {
                            change('triggers', triggers);
                        }
                        if (nodes !== lastNodes) {
                            change('nodes', nodes);
                        }
                        if (orphans !== lastOrphans) {
                            change('orphans', orphans);
                        }
                        if (swimlanes !== lastSwimlanes) {
                            change('swimlanes', swimlanes);
                        }
                    }
                    else {
                        if (nextTriggers !== lastTriggers) {
                            change('triggers', nextTriggers);
                        }
                        if (nextNodes !== lastNodes) {
                            change('nodes', nextNodes);
                        }
                        if (nextOrphans !== lastOrphans) {
                            change('orphans', nextOrphans);
                        }
                    }
                }
                if (nextVariables !== lastVariables) {
                    change('variables', nextVariables);
                }
                if (nextPackages !== lastPackages) {
                    change('packages', nextPackages);
                }
                this.dirty();
            });
        };
        if (variableRename) {
            clearTimeout(this.pageClickTimeout);
            this.handleApplyNodeDetails(callback);
        }
        else {
            callback();
        }
    };

    handleWorkItemTemplateChange = (event, workItemTemplateName) => {
        if (!this._isMounted) {
            return;
        }
        const {getFieldValue} = this.props;
        const lastVariables = getFieldValue('variables');
        const lastWorkItemTemplateName = getFieldValue('workItemTemplateName');
        // Check to see if we need to warn the user about losing data
        const usedVariableSet = this.selectReferencedVariablesSet(this.props).clone();
        const wasWorkItemUsed = usedVariableSet.has('workitem');
        const wasWorkItemResultUsed = usedVariableSet.has('workitemresult');
        const wasUserDefined = lastVariables.some((variable) => !variable.workItem && (variable.key === 'workitem' || variable.key === 'workitemresult'));
        if (wasUserDefined) {
            this.setState({
                workItemConfirm: true,
                workItemTemplateName,
                workItemWasUserDefined: wasUserDefined,
                lastWorkItemTemplateName,
            });
            return;
        }
        if (wasWorkItemUsed || wasWorkItemResultUsed) {
            const workItemReferenced = wasWorkItemUsed || wasWorkItemResultUsed;
            this.setState({
                workItemConfirm: true,
                workItemTemplateName,
                workItemReferenced,
                lastWorkItemTemplateName,
            });
            return;
        }
        this.setState({
            workItemTemplateName,
            lastWorkItemTemplateName,
        }, () => this.handleWorkItemTemplateConfirm());
    };

    handleWorkItemTemplateConfirm = () => {
        if (!this._isMounted) {
            return;
        }
        const {workItemTemplates, change, getFieldValue} = this.props;
        const {workItemTemplateName, lastWorkItemTemplateName, undo} = this.state;
        const packages = getFieldValue('packages');
        const packageSettings = getFieldValue('packageSettings');
        const triggers = getFieldValue('triggers');
        const nodes = getFieldValue('nodes');
        const orphans = getFieldValue('orphans');
        const swimlanes = getFieldValue('swimlanes');
        const swimlaneStacking = getFieldValue('swimlaneStacking');
        const variables = getFieldValue('variables');
        this.setState({
            workItemConfirm: false,
            undo: [
                {
                    packages,
                    packageSettings,
                    triggers,
                    nodes,
                    orphans,
                    swimlanes,
                    swimlaneStacking,
                    variables,
                    workItemTemplateName: lastWorkItemTemplateName,
                    type: CHANGE_TYPE_WORKITEM_TEMPLATE,
                },
                ...undo,
            ].slice(0, MAXIMUM_UNDO_REDO),
            redo: [],
        }, () => {
            const defaultValue = {
                type: VALUE_TYPE_RECORD,
                record: {
                    schema: [],
                    values: [],
                },
            };
            const nextVariables = variables.filter((variable) => variable.key !== 'workitem' && variable.key !== 'workitemresult');
            const workItemTemplate = workItemTemplates.find((template) => template.name === workItemTemplateName);
            if (workItemTemplate) {
                workItemTemplate.attributes.forEach((attribute) => {
                    switch (attribute.type) {
                        default:
                        case 'TEXT':
                            defaultValue.record.schema.push({
                                name: attribute.name,
                                type: VALUE_TYPE_STRING,
                            });
                            defaultValue.record.values.push({
                                type: VALUE_TYPE_STRING,
                                string: '',
                            });
                            break;
                        case 'NUMBER':
                            defaultValue.record.schema.push({
                                name: attribute.name,
                                type: VALUE_TYPE_NUMBER,
                            });
                            defaultValue.record.values.push({
                                type: VALUE_TYPE_NUMBER,
                                string: '',
                            });
                            break;
                        case 'DATE':
                            defaultValue.record.schema.push({
                                name: attribute.name,
                                type: VALUE_TYPE_DATETIME,
                            });
                            defaultValue.record.values.push({
                                type: VALUE_TYPE_DATETIME,
                                string: '',
                            });
                            break;
                    }
                });
                nextVariables.push({
                    key: 'workitem',
                    name: 'workItem',
                    description: '',
                    type: VALUE_TYPE_RECORD,
                    subtype: VALUE_TYPE_UNDEFINED,
                    readOnly: true,
                    input: true,
                    output: false,
                    workItem: true,
                    defaultValue,
                });
                nextVariables.push({
                    key: 'workitemresult',
                    name: 'workItemResult',
                    description: '',
                    type: VALUE_TYPE_STRING,
                    subtype: VALUE_TYPE_UNDEFINED,
                    readOnly: false,
                    input: false,
                    output: true,
                    workItem: true,
                    defaultValue: {
                        type: VALUE_TYPE_STRING,
                        string: '',
                    },
                });
            }
            change('variables', nextVariables);
            this.dirty();
        });
    };

    handleWorkItemTemplateCancel = () => {
        if (!this._isMounted) {
            return;
        }

        const {change} = this.props;
        const {lastWorkItemTemplateName} = this.state;
        this.setState({workItemConfirm: false}, () => {
            change('workItemTemplateName', lastWorkItemTemplateName);
            this.dirty();
        });
    };

    handleDebugPointsChange = (filePath, fileId, debugPointsDelta) => {
        const {onDebuggerBreakpointsChange, onDebuggerVariablesChange, onDebuggerFrameVariablesFetch, actions, debugger: dbugger} = this.props;
        const {debugPointsMap} = this.state;
        const currentDebugPoints = debugPointsMap.get(filePath);
        const nextDebugPointsMap = new CheapMap(debugPointsMap);
        const nextDebugPoints = {...currentDebugPoints, ...debugPointsDelta};
        const breakpointsList = nextDebugPoints.breakpoints ?? [];
        const watchersList = nextDebugPoints.watchVariables ?? [];
        const breakpoints = [...breakpointsList].map((nodeUid) => ({nodeUid, enabled: true}));
        const watchVariables = [...watchersList].map((variableName) => ({variableName}));
        nextDebugPointsMap.set(filePath, nextDebugPoints);
        this.setState({debugPointsMap: nextDebugPointsMap.clone()});
        if (dbugger?.botAgentDebugApiVersion < 3) {
            if (onDebuggerVariablesChange && watchersList) {
                onDebuggerVariablesChange([...watchersList]);
            }

            if (onDebuggerBreakpointsChange && breakpointsList) {
                onDebuggerBreakpointsChange([...breakpointsList]);
            }
        }
        else if (dbugger?.botAgentDebugApiVersion >= 3) {
            const updateDebugPoints = {
                frameUuid: dbugger?.currentCallstackFrameUuid,
                breakpoints,
                watchVariables,
            };
            onDebuggerFrameVariablesFetch(updateDebugPoints);
        }
        actions.repositoriesSetDebugPoints(fileId, {
            watchVariables,
            breakpoints,
        });
    };

    handleExternalOptionsChange = (key, value) => {
        if (!this._isMounted) {
            return;
        }
        const {externalOptions} = this.state;
        this.setState({externalOptions: {
            ...externalOptions,
            [key]: {
                ...externalOptions[key],
                ...value,
            },
        }});
    };

    handleRefresh = () => {
        this.setState((state) => ({refresh: state.refresh + 1}));
    };

    handleView = () => {
        const {params: {workspaceName, fileId}, actions} = this.props;
        actions.pagesNavigate(`/bots/repository/${workspaceName}/files/task/${fileId}/view`);
    };

    handleClose = () => {
        const {automationFile, params: {workspaceName}, actions} = this.props;
        actions.pagesNavigate(automationFile?.parentId
            ? `/bots/repository/${workspaceName}/folders/${automationFile.parentId}`
            : `/bots/repository/${workspaceName}`,
        );
    };

    handleGetFileInterfaces = (callback) => {
        const checkPaths = (count) => {
            // Check for a maximum of 10s (400 x 50ms), then give up
            if (count < 400) {
                const fileInterfacePaths = this.selectFileInterfacePaths(this.props, this.state);
                const {fileInterfaceMap} = this.props;
                if (fileInterfacePaths.some((path) => fileInterfaceMap[path] === undefined)) { // undefined = unloaded, null = empty
                    this.setState({isGettingFileInterfaces: true}, () => {
                        this.saveTimeout = setTimeout(() => checkPaths(count + 1), 50);
                    });
                    return;
                }
            }
            this.setState({isGettingFileInterfaces: false}, () => callback());
        };
        checkPaths(0);
    };

    handleApplyNodeDetails = (callback) => {
        let delay = 0;
        const withDelay = (callback) => {
            if (!delay) {
                callback();
            }
            else {
                this.saveTimeout = setTimeout(callback, delay);
            }
            delay += 50;
        };
        // see if we have changes or unsaved details
        let {pristine} = this.props;
        const {opened} = this.state;
        if (opened?.size) {
            const state = getState();
            const findNodesWithChanges = (nodes, nodesWithChanges) => {
                if (!nodes?.length) {
                    return;
                }
                nodes.forEach((node) => {
                    if (opened.get(`node:${node.uid}`) === 'edit') {
                        const name = `taskbot-node-${node.uid}`;
                        if (!isPristine(name)(state)) {
                            nodesWithChanges.push(node);
                        }
                    }
                    findNodesWithChanges(node.children, nodesWithChanges);
                    findNodesWithChanges(node.branches, nodesWithChanges);
                });
            };
            const {getFieldValue, fileInterfaceMap, packageDetails} = this.props;
            // Update unsaved nodes
            const nodes = getFieldValue('nodes');
            const orphans = getFieldValue('orphans');
            const swimlanes = getFieldValue('swimlanes');
            const nodesWithChanges = [];
            findNodesWithChanges(nodes, nodesWithChanges);
            orphans?.forEach(({nodes}) => findNodesWithChanges(nodes, nodesWithChanges));
            findNodesWithChanges(swimlanes, nodesWithChanges);
            if (nodesWithChanges.length > 0) {
                const updateNodes = (nodes) => {
                    let nextNodes = nodes;
                    const {commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap} = packageDetails;
                    const variables = getFieldValue('variables') || EMPTY_ARRAY;
                    nodesWithChanges.forEach((node) => {
                        const object = commandMap[getPackageCommandKey(node)];
                        const values = getFormValues(`taskbot-node-${node.uid}`)(state);
                        const nextNode = getNextNode(NODE_TYPE_COMMAND, node, values, object, iteratorMap, conditionalMap, triggerMap, exceptionMap, variables, fileInterfaceMap);
                        nextNodes = replaceNodes(
                            nextNodes,
                            (currentNode) => currentNode.uid === node.uid,
                            (nodes) => nodes.map((otherNode) => {
                                if (otherNode.uid !== node.uid) {
                                    return otherNode;
                                }

                                return nextNode;
                            }),
                        );
                    });
                    return nextNodes;
                };
                const nextNodes = updateNodes(nodes);
                const nextOrphans = getNextOrphans(orphans, updateNodes);
                const nextSwimlanes = updateNodes(swimlanes);
                if (nodes !== nextNodes || orphans !== nextOrphans || swimlanes !== nextSwimlanes) {
                    withDelay(() => this.handleNodesChange({nodes: nextNodes, orphans: nextOrphans, swimlanes: nextSwimlanes}));
                }
                pristine = false;
            }
            // update unsaved triggers
            const triggers = getFieldValue('triggers');
            const triggersWithChanges = [];
            findNodesWithChanges(triggers, triggersWithChanges);
            if (triggersWithChanges.length > 0) {
                let nextTriggers = triggers;
                const {iteratorMap, conditionalMap, triggerMap, exceptionMap} = packageDetails;
                const variables = getFieldValue('variables') || EMPTY_ARRAY;
                triggersWithChanges.forEach((node) => {
                    const object = triggerMap[getPackageTriggerKey(node)];
                    const values = getFormValues(`taskbot-node-${node.uid}`)(state);
                    const nextTrigger = getNextNode(NODE_TYPE_TRIGGER, node, values, object, iteratorMap, conditionalMap, triggerMap, exceptionMap, variables, fileInterfaceMap);
                    nextTriggers = replaceNodes(
                        nextTriggers,
                        (currentNode) => currentNode.uid === node.uid,
                        (nodes) => nodes.map((otherNode) => otherNode.uid === node.uid ? nextTrigger : otherNode),
                    );
                });
                if (triggers !== nextTriggers) {
                    withDelay(() => this.handleNodesChange({triggers: nextTriggers}));
                    pristine = false;
                }
            }
        }
        withDelay(() => {
            this.handleGetFileInterfaces(() => {
                callback({pristine, withDelay});
            });
        });
    };

    handleCheckUnsaved = (callback, options) => {
        if (!this._isMounted) {
            return;
        }
        clearTimeout(this.pageClickTimeout);
        this.handleApplyNodeDetails(({withDelay, pristine}) => {
            if (pristine) {
                if (typeof callback === 'function') {
                    callback();
                }
                else {
                    this.handleSubmit();
                }
                return;
            }
            withDelay(() => {
                const handleCallback = () => {
                    if (typeof callback === 'function') {
                        this.saveTimeout = setTimeout(callback, 50);
                    }
                };
                this.handleSubmit(handleCallback, options?.silent ? handleCallback : null);
            });
        });
    };

    handleSubmit = (onSave, onSaveError) => {
        const {
            workspaceName,
            automationFile, automationType,
            updatePending, loadPending, invalid, pristine,
            handleSubmit,
            actions,
        } = this.props;
        const {isGettingFileInterfaces, opened} = this.state;
        if (!automationFile || updatePending || isGettingFileInterfaces || loadPending || invalid) {
            return;
        }
        if (pristine) {
            let editNodeUid = null;
            for (const entry of opened) {
                if (entry.value === 'edit' && entry.key.startsWith('node:')) {
                    editNodeUid = entry.key.replace(/^node:/g, '');
                    break;
                }
            }
            if (editNodeUid) {
                dispatch(reset(`taskbot-node-${editNodeUid}`));
            }
            return;
        }
        handleSubmit((values) => {
            const {content, dependencies, hasErrors} = this.getContent(values);
            if (getAutomationTypeHasDebug(automationType)) {
                this.processDebugPoints();
            }
            const onUpdate = () => {
                const {initialize} = this.props;
                initialize(values);
                onSave();
            };
            this.setState({
                errorBlocking: !onSaveError,
            }, () => {
                actions.repositoriesUpdateFile(workspaceName, automationFile, content, dependencies, hasErrors, onUpdate, onSaveError);
            });
        })();
    };

    handleSave = () => {
        const {updatePending, loadPending, invalid, debugger: dbugger} = this.props;
        const {isGettingFileInterfaces, fileEditShow} = this.state;
        const isPristine = this.selectIsPristine(this.props, this.state);
        if (fileEditShow || updatePending || isGettingFileInterfaces || loadPending || invalid || isPristine || dbugger) {
            return;
        }
        this.handleCheckUnsaved();
    };

    handleTabChange = (tabId) => {
        if (!this._isMounted) {
            return;
        }
        if (tabId === this.state.tabId) {
            return;
        }
        const {invalid} = this.props;
        if (invalid) {
            this.setState({tabId, opened: new CheapMap()});
            return;
        }
        this.handleCheckUnsaved(() => {
            this.setState({tabId, opened: new CheapMap()});
        }, {
            silent: true,
        });
    };

    handleEditorShow = () => {
        this.handleTabChange('editor');
    };

    handlePackageOpen = (pkg) => {
        if (!pkg) {
            return;
        }
        const {packageVersions, actions} = this.props;
        if (packageVersions?.[pkg.name]) {
            return;
        }
        actions.packagesGetTaskbotPackageVersions(pkg.name);
    };

    handleDesktopSend = (message) => {
        const {onDesktopSend} = this.props;
        onDesktopSend(message);
    };

    handleDebuggerSend = (message) => {
        const {onDebuggerSend} = this.props;
        onDebuggerSend(message);
    };

    handleRecorderStart = (...args) => {
        const {automationFile, onRecorderStart} = this.props;
        onRecorderStart(automationFile, ...args);
    };

    handleFileRequest = (...args) => {
        const {automationFile, onFileRequest} = this.props;
        onFileRequest(automationFile, ...args);
    };

    handleOperationButtonRequst = (...args) => {
        const {automationFile, onOperationButtonRequest} = this.props;
        onOperationButtonRequest(automationFile, ...args);
    };

    handleOperationTreeRequest = (...args) => {
        const {automationFile, onOperationTreeRequest} = this.props;
        onOperationTreeRequest(automationFile, ...args);
    };

    handleOperationTableRequest = (...args) => {
        const {automationFile, onOperationTableRequest} = this.props;
        onOperationTableRequest(automationFile, ...args);
    };

    handleOperationSelectRequest = (...args) => {
        const {automationFile, onOperationSelectRequest} = this.props;
        onOperationSelectRequest(automationFile, ...args);
    };

    handleObjectCaptureRequest = (...args) => {
        const {automationFile, onObjectCaptureRequest} = this.props;
        onObjectCaptureRequest(automationFile, ...args);
    };

    handleAnchorCaptureRequest = (...args) => {
        const {automationFile, onAnchorCaptureRequest} = this.props;
        onAnchorCaptureRequest(automationFile, ...args);
    };

    handleImageCaptureRequest = (...args) => {
        const {automationFile, onImageCaptureRequest} = this.props;
        onImageCaptureRequest(automationFile, ...args);
    };

    handleCoordinateCaptureRequest = (...args) => {
        const {automationFile, onCoordinateCaptureRequest} = this.props;
        onCoordinateCaptureRequest(automationFile, ...args);
    };

    handleRegionCaptureRequest = (...args) => {
        const {automationFile, onRegionCaptureRequest} = this.props;
        onRegionCaptureRequest(automationFile, ...args);
    };

    handleWindowsRequest = (...args) => {
        const {automationFile, onWindowsRequest} = this.props;
        onWindowsRequest(automationFile, ...args);
    };

    handleBrowserTabsRequest = (...args) => {
        const {automationFile, onBrowserTabsRequest} = this.props;
        onBrowserTabsRequest(automationFile, ...args);
    };

    handleRunProcess = () => {
        const {automationFile} = this.props;
        const abortController = window.AbortController ? new AbortController() : null;
        this.setState({
            runProcessPending: {
                cancel: abortController ? () => abortController.abort() : null,
            },
        }, async() => {
            const signal = abortController?.signal ?? null;
            try {
                const content = await getFileContent(signal, automationFile.id, FILE_TYPE_PROCESS);
                if ((content.properties?.processCodeVersion || '0') === '0') {
                    const {status, errors} = await validateProcess(signal, {nodes: content.nodes, variables: content.variables});
                    if (status === 'ERROR') {
                        const sanitizedErrors = errors?.length > 0
                            ? errors.reduce((result, error) => {
                                if (error?.type === 'ERROR') {
                                    const sanitizedError = Object.entries(error)
                                        .reduce((result, [key, value]) => {
                                            if (value) {
                                                result[key] = value;
                                            }
                                            return result;
                                        }, {});
                                    if (Object.keys(sanitizedError).length > 0) {
                                        result.push(sanitizedError);
                                    }
                                }
                                return result;
                            }, [])
                            : [];
                        this.runProcessAbort = null;
                        this.setState({
                            message: {
                                id: 'taskbot-run-process-validate',
                                title: 'taskbot:run-process-validate-title',
                                body: 'taskbot:run-process-validate-body',
                                code: sanitizedErrors.length > 0 ? JSON.stringify(sanitizedErrors, null, 2) : null,
                            },
                            runProcessPending: null,
                        });
                        return;
                    }
                }
            }
            catch (error) {
                this.runProcessAbort = null;
                this.setState({
                    message: {
                        id: 'taskbot-run-process-validate',
                        title: 'taskbot:run-process-validate-title',
                        body: 'taskbot:run-process-validate-body',
                    },
                    runProcessPending: null,
                });
                return;
            }
            try {
                const {processInfoId} = await publishProcess(signal, automationFile.uri);
                window.top.open(`/aari/#/processes?processInfoId=${processInfoId}&name=${automationFile.name}`, '_blank', 'noopener');
            }
            catch (error) {
                this.runProcessAbort = null;
                this.setState({
                    message: {
                        id: 'taskbot-run-process-publish',
                        title: 'taskbot:run-process-publish-title',
                        body: 'taskbot:run-process-publish-body',
                    },
                    runProcessPending: null,
                });
                return;
            }
            this.setState({
                runProcessPending: null,
            });
        });
    };

    handleRunStart = () => {
        if (!this._isMounted) {
            return;
        }
        this.handleCheckUnsaved(() => {
            const {automationType, automationFile, getFieldValue, automationReport, onRunStart} = this.props;
            if (!onRunStart) {
                return;
            }
            const nodes = getFieldValue('nodes');
            if (isEmpty(nodes)) {
                this.setState({
                    message: {
                        title: 'taskbot:run-empty-title',
                        body: 'taskbot:run-empty-body',
                        id: 'taskbot-run-empty',
                    },
                });
                return;
            }
            const {hasErrors} = automationReport;
            if (hasErrors) {
                this.setState({
                    message: {
                        title: 'taskbot:run-errors-title',
                        body: 'taskbot:run-errors-body',
                        id: 'taskbot-run-errors',
                    },
                });
                return;
            }
            if (automationType === FILE_TYPE_PROCESS) {
                this.handleRunProcess();
                return;
            }
            const variables = getFieldValue('variables');
            this.handleInputVariablesCheck(variables, (botInput) => {
                onRunStart(automationFile, nodes, botInput);
            });
        });
    };

    handleRunFromStart = (node) => {
        if (!this._isMounted) {
            return;
        }
        this.handleCheckUnsaved(() => {
            const {automationFile, automationReport, getFieldValue, onRunStart} = this.props;
            if (!onRunStart || !node) {
                return;
            }
            const nodes = getFieldValue('nodes');
            if (isEmpty(nodes)) {
                this.setState({
                    message: {
                        title: 'taskbot:run-empty-title',
                        body: 'taskbot:run-empty-body',
                        id: 'taskbot-run-empty',
                    },
                });
                return;
            }
            const {hasErrors} = automationReport;
            if (hasErrors) {
                this.setState({
                    message: {
                        title: 'taskbot:run-errors-title',
                        body: 'taskbot:run-errors-body',
                        id: 'taskbot-run-errors',
                    },
                });
                return;
            }
            const variables = getFieldValue('variables');
            this.handleInputVariablesCheck(variables, (botInput) => {
                onRunStart(automationFile, nodes, botInput, false, node.uid);
            });
        });
    };

    handleRunTriggersStart = () => {
        if (!this._isMounted) {
            return;
        }
        this.handleCheckUnsaved(() => {
            const {automationFile, automationReport, getFieldValue, onRunStart} = this.props;
            if (!onRunStart) {
                return;
            }
            const nodes = getFieldValue('nodes');
            if (isEmpty(nodes)) {
                this.setState({
                    message: {
                        title: 'taskbot:run-empty-title',
                        body: 'taskbot:run-empty-body',
                        id: 'taskbot-run-empty',
                    },
                });
                return;
            }
            const {hasErrors} = automationReport;
            if (hasErrors) {
                this.setState({
                    message: {
                        title: 'taskbot:run-errors-title',
                        body: 'taskbot:run-errors-body',
                        id: 'taskbot-run-errors',
                    },
                });
                return;
            }
            const triggers = getFieldValue('triggers');
            onRunStart(automationFile, nodes, null, triggers);
        });
    };

    handleRunQueueStart = () => {
        if (!this._isMounted) {
            return;
        }
        this.handleCheckUnsaved(() => {
            const {automationFile, getFieldValue, automationReport, onRunStart} = this.props;
            if (!onRunStart) {
                return;
            }
            const nodes = getFieldValue('nodes');
            if (isEmpty(nodes)) {
                this.setState({
                    message: {
                        title: 'taskbot:run-empty-title',
                        body: 'taskbot:run-empty-body',
                        id: 'taskbot-run-empty',
                    },
                });
                return;
            }
            const {hasErrors} = automationReport;
            if (hasErrors) {
                this.setState({
                    message: {
                        title: 'taskbot:run-errors-title',
                        body: 'taskbot:run-errors-body',
                        id: 'taskbot-run-errors',
                    },
                });
                return;
            }
            this.handleWorkItemTemplateQueueCheck((queue) => {
                onRunStart(automationFile, nodes, null, false, null, queue?.id);
            });
        });
    };

    handleDebuggerEnter = (onDone) => {
        if (!this._isMounted) {
            return;
        }
        if (this.state.debugger) {
            this.setState({
                assistantShow: true,
                assistantPage: 'debugger',
            }, onDone);
            return;
        }
        this.handleCheckUnsaved(() => {
            const {automationFile, automationReport, getFieldValue, onDebuggerEnter} = this.props;
            if (!onDebuggerEnter) {
                return;
            }
            const nodes = getFieldValue('nodes');
            if (isEmpty(nodes)) {
                this.setState({
                    message: {
                        title: 'taskbot:debug-empty-title',
                        body: 'taskbot:debug-empty-body',
                        id: 'taskbot-debug-empty',
                    },
                });
                return;
            }
            const {hasErrors} = automationReport;
            if (hasErrors) {
                this.setState({
                    message: {
                        title: 'taskbot:debug-errors-title',
                        body: 'taskbot:debug-errors-body',
                        id: 'taskbot-debug-errors',
                    },
                });
                return;
            }
            onDebuggerEnter(automationFile, nodes, () => this.setState({
                assistantShow: true,
                assistantPage: 'debugger',
            }, onDone));
        });
    };

    handleDebuggerUpdateNodeValue = ({nodeUid, valueAddress, valueReplace}) => {
        const {getFieldValue} = this.props;
        const lastNodes = getFieldValue('nodes');
        const nextNodes = applyNodeValueUpdateByAddress(lastNodes, nodeUid, valueAddress, valueReplace);
        if (lastNodes !== nextNodes) {
            this.handleNodesChange({nodes: nextNodes});
        }
    };

    handleDebuggerUpdateNodeValues = ({nodeUid, valueUpdateEntries}) => {
        const {getFieldValue} = this.props;
        const lastNodes = getFieldValue('nodes');
        let nextNodes = lastNodes;
        valueUpdateEntries.forEach(({valueAddressEntries: valueAddress, valueReplace}) => {
            nextNodes = applyNodeValueUpdateByAddress(nextNodes, nodeUid, valueAddress, valueReplace);
        });
        if (lastNodes !== nextNodes) {
            this.handleNodesChange({nodes: nextNodes});
        }
    };

    handleDebuggerStart = (isStep) => {
        this.handleDebuggerEnter(() => {
            if (!this._isMounted) {
                return;
            }
            const {automationFile, getFieldValue, route: {mode}, onDebuggerStart} = this.props;
            if (!onDebuggerStart) {
                return;
            }
            const {debugPointsMap} = this.state;
            const debugPoints = debugPointsMap.get(automationFile.path);
            const {breakpoints: savedBreakpoints = EMPTY_ARRAY, watchVariables = EMPTY_ARRAY} = debugPoints;
            const breakpoints = [...savedBreakpoints];
            const nodes = getFieldValue('nodes') ?? EMPTY_ARRAY;
            const variables = getFieldValue('variables') ?? EMPTY_ARRAY;
            if (isStep) {
                const firstNode = getNode(nodes, Boolean, false);
                if (firstNode?.uid && !breakpoints.includes(firstNode.uid)) {
                    breakpoints.unshift(firstNode.uid);
                }
            }
            this.handleInputVariablesCheck(variables, (botInput) => {
                onDebuggerStart(mode === 'edit', automationFile, nodes, botInput, [...breakpoints], [...watchVariables], this.handleDebuggerUpdateNodeValue, this.handleDebuggerUpdateNodeValues);
            });
        });
    };

    handleDebuggerStop = () => {
        if (!this._isMounted) {
            return;
        }
        const {onDebuggerExit} = this.props;
        onDebuggerExit();
    };

    handleDebuggerFrameChange = (frameUuid) => {
        if (!this._isMounted) {
            return;
        }
        const {onDebuggerFrameVariablesReset, debugger: dbugger} = this.props;
        const {debugPointsMap} = this.state;
        if (dbugger?.callstackFrames?.length > 0) {
            const {assistantPage} = this.state;
            const rootFrame = dbugger.callstackFrames.at(0);
            const isRootFrame = frameUuid === rootFrame.frameUuid;
            if (assistantPage !== 'debugger' && !isRootFrame) {
                this.handleAssistantPageChange(null);
            }
            const currentFrame = dbugger.callstackFrames.find((frame) => frame.frameUuid === frameUuid);
            if (currentFrame) {
                const filePath = getFileInfoFromFrame(currentFrame).filePath;
                const hasDebugPoints = debugPointsMap.has(filePath);
                if (hasDebugPoints) {
                    if (onDebuggerFrameVariablesReset) {
                        onDebuggerFrameVariablesReset(frameUuid);
                    }
                }
                else if (dbugger?.botAgentDebugApiVersion >= 3) {
                    const {actions} = this.props;
                    const fileId = getFileInfoFromFrame(currentFrame).fileId;
                    actions.repositoriesGetDebugPoints(fileId, (result) => {
                        const {breakpoints: breakpointsList, watchVariables} = result;
                        const variablesList = watchVariables.map((watchVariable) => watchVariable.variableName);
                        this.setState({
                            debugPointsMap: new CheapMap(debugPointsMap).set(filePath, {
                                breakpoints: breakpointsList.map((breakpoint) => breakpoint.nodeUid),
                                watchVariables: CheapSet.fromArray(variablesList),
                            }),
                        }, () => {
                            this.handleDebuggerFrameVariablesFetch(currentFrame.frameUuid);
                        });
                    });
                }
            }
        }
    };

    handleDebuggerFrameVariablesReset = (activeFrameUid, variablesToWatch) => {
        if (!this._isMounted) {
            return;
        }
        const {
            onDebuggerFrameVariablesReset, automationFile,
            debugger: dbugger, actions,
        } = this.props;
        const {debugPointsMap} = this.state;
        let filePath = automationFile.path;
        let fileId = automationFile.id;
        if (dbugger?.callstackFrames?.length > 0 && activeFrameUid) {
            const currentFrame = dbugger.callstackFrames.find((frame) => frame.frameUuid === activeFrameUid);
            filePath = getFileInfoFromFrame(currentFrame).filePath;
            fileId = getFileInfoFromFrame(currentFrame).fileId;
        }
        const lastBreakpoints = debugPointsMap.get(filePath).breakpoints;
        const watchVariables = variablesToWatch.clone();
        const nextDebugPointsMap = new CheapMap(debugPointsMap);
        nextDebugPointsMap.set(filePath, {breakpoints: [...lastBreakpoints], watchVariables});
        this.setState({debugPointsMap: nextDebugPointsMap.clone()});
        if (dbugger) {
            if (onDebuggerFrameVariablesReset) {
                onDebuggerFrameVariablesReset(activeFrameUid);
            }
        }
        const breakpoints = lastBreakpoints.map((nodeUid) => ({nodeUid, enabled: true}));
        const watchVariablesList = [...variablesToWatch].map((variable) => ({variableName: variable}));
        actions.repositoriesSetDebugPoints(fileId, {
            breakpoints,
            watchVariables: watchVariablesList,
        });
    };

    handleDebuggerFrameVariablesFetch = (frameUuid) => {
        if (!this._isMounted) {
            return;
        }
        const {onDebuggerFrameVariablesFetch, debugger: dbugger} = this.props;
        const {debugPointsMap} = this.state;
        if (dbugger?.callstackFrames?.length > 0) {
            const currentFrame = dbugger.callstackFrames.find((frame) => frame.frameUuid === frameUuid);
            const currentFrameIndex = dbugger.callstackFrames.findIndex((frame) => frame.frameUuid === currentFrame.frameUuid);
            const filePath = getFileInfoFromFrame(currentFrame).filePath;
            const hasDebugPoints = debugPointsMap.has(filePath);
            if (hasDebugPoints) {
                const debugPoints = debugPointsMap.get(filePath);
                const {breakpoints: breakpointsList, watchVariables: watchers} = debugPoints;
                let breakpoints = breakpointsList.map((nodeUid) => ({nodeUid, enabled: true}));
                if (dbugger?.botAgentDebugApiVersion <= 3 && currentFrameIndex > 0) {
                    breakpoints = EMPTY_ARRAY;
                }
                const watchVariables = [...watchers].map((variable) => ({variableName: variable}));
                if (onDebuggerFrameVariablesFetch && watchers) {
                    const updateDebugPoints = {
                        frameUuid,
                        breakpoints,
                        watchVariables,
                    };
                    onDebuggerFrameVariablesFetch(updateDebugPoints);
                }
            }
        }
    };

    handleInputVariablesCheck = (variables, inputVariableCallback = null) => {
        if (!this._isMounted) {
            return;
        }
        if (!variables || !inputVariableCallback) {
            return;
        }
        const inputVariableList = variables.filter((variable) => {
            switch (variable.type) {
                case VALUE_TYPE_STRING:
                case VALUE_TYPE_NUMBER:
                case VALUE_TYPE_BOOLEAN:
                case VALUE_TYPE_FILE:
                case VALUE_TYPE_DATETIME:
                case VALUE_TYPE_WINDOW:
                case VALUE_TYPE_LIST:
                case VALUE_TYPE_DICTIONARY:
                case VALUE_TYPE_RECORD:
                case VALUE_TYPE_TABLE:
                    return variable.input;
                case VALUE_TYPE_CREDENTIAL:
                case VALUE_TYPE_FORM:
                default:
                    return false;
            }
        });
        if (inputVariableList.length === 0) {
            inputVariableCallback(null);
            return;
        }
        this.setState({
            inputVariableShow: true,
            inputVariableList,
            inputVariableCallback,
        });
    };

    handleInputVariablesConfirm = (inputVariableValues) => {
        if (!this._isMounted) {
            return;
        }
        const {inputVariableCallback} = this.state;
        this.setState({
            inputVariableShow: false,
            inputVariableList: [],
            inputVariableCallback: null,
            inputVariableValues,
        }, () => inputVariableCallback(inputVariableValues));
    };

    handleInputVariablesCancel = () => {
        if (!this._isMounted) {
            return;
        }
        const {debugger: dbugger} = this.props;
        if (dbugger) {
            this.handleDebuggerStop();
        }
        this.setState({
            inputVariableShow: false,
            inputVariableList: [],
            inputVariableCallback: null,
        });
    };

    handleWorkItemTemplateQueueCheck = (workItemTemplateQueueCallback) => {
        if (!this._isMounted) {
            return;
        }
        if (!workItemTemplateQueueCallback) {
            return;
        }
        const {getFieldValue} = this.props;
        const workItemTemplateName = getFieldValue('workItemTemplateName');
        const {lastWorkItemTemplateQueueValue, lastWorkItemTemplateName} = this.state;
        this.setState({
            workItemTemplateQueueShow: true,
            workItemTemplateQueueValue: workItemTemplateName === lastWorkItemTemplateName
                ? lastWorkItemTemplateQueueValue || null
                : null,
            workItemTemplateQueueCallback,
        });
    };

    handleWorkItemTemplateQueueConfirm = () => {
        if (!this._isMounted) {
            return;
        }
        const {workItemTemplateQueueValue, workItemTemplateQueueCallback} = this.state;
        const {getFieldValue} = this.props;
        const workItemTemplateName = getFieldValue('workItemTemplateName');
        this.setState({
            workItemTemplateQueueShow: false,
            workItemTemplateQueueValue: null,
            workItemTemplateQueueCallback: null,
            lastWorkItemTemplateName: workItemTemplateName,
            lastWorkItemTemplateQueueValue: workItemTemplateQueueValue,
        }, () => workItemTemplateQueueCallback(workItemTemplateQueueValue));
    };

    handleWorkItemTemplateQueueCancel = () => {
        if (!this._isMounted) {
            return;
        }
        this.setState({
            workItemTemplateQueueShow: false,
            workItemTemplateQueueValue: null,
            workItemTemplateQueueCallback: null,
        });
    };

    handleMessageClose = () => {
        if (!this._isMounted) {
            return;
        }

        this.setState({message: null});
    };

    handleChatbotChange = (chatbot, lastMessage) => {
        clearTimeout(this.pageClickTimeout);
        this.handleApplyNodeDetails(() => {
            this.setState({
                chatbot,
                chatbotLastMessageTimestamp: lastMessage?.timestamp ?? this.state.chatbotLastMessageTimestamp,
            }, lastMessage?.gaiMessageData && lastMessage.timestamp !== this.state.chatbotLastMessageTimestamp ? () => {
                const {deltas, directive} = lastMessage.gaiMessageData;
                if (deltas.length > 0) {
                    const {automationType, getFieldValue} = this.props;
                    const lastNodes = getFieldValue('nodes');
                    const lastVariables = getFieldValue('variables');
                    let nextNodes = lastNodes;
                    let nextVariables = lastVariables;
                    const getDeltaNodes = (beforeNode, deltaNodes) => {
                        if (getAutomationTypeIsProcess(automationType)) {
                            forNodesWithMetadata(deltaNodes, (node, context) => {
                                if (context.index > 0) {
                                    node.layout = {
                                        ...node.layout || {},
                                        initialNodeId: context.nodes.at(context.index - 1)?.uid,
                                    };
                                    return;
                                }
                                if (context.parentNodes?.length > 0) {
                                    node.layout = {
                                        ...node.layout || {},
                                        initialNodeId: context.parentNodes.at(-1)?.uid,
                                    };
                                    return;
                                }
                                if (beforeNode?.uid) {
                                    node.layout = {
                                        ...node.layout || {},
                                        initialNodeId: beforeNode.uid,
                                    };
                                }
                            });
                        }
                        return deltaNodes;
                    };
                    deltas.forEach((deltaType) => {
                        const deltaNodesAppend = deltaType.botNodesAppend || deltaType.processNodesAppend;
                        if (deltaNodesAppend) {
                            const deltaNodes = deltaNodesAppend.nodes;
                            if (deltaNodes?.length > 0) {
                                nextNodes = [...nextNodes, ...getDeltaNodes(nextNodes.at(-1), deltaNodes)];
                            }
                            return;
                        }
                        const deltaNodesInsertBefore = deltaType.botNodesInsertBefore || deltaType.processNodesInsertBefore;
                        if (deltaNodesInsertBefore) {
                            const deltaTargetUid = deltaNodesInsertBefore.targetUid;
                            const deltaNodes = deltaNodesInsertBefore.nodes;
                            if (deltaNodes?.length > 0) {
                                nextNodes = replaceNodes(
                                    nextNodes,
                                    (node) => node.uid === deltaTargetUid,
                                    (nodes) => {
                                        const index = nodes.findIndex((node) => node.uid === deltaTargetUid);
                                        return [
                                            ...nodes.slice(0, index),
                                            ...getDeltaNodes(nodes[index - 1], deltaNodes),
                                            ...nodes.slice(index),
                                        ];
                                    },
                                );
                            }
                            return;
                        }
                        const deltaNodesAppendChildren = deltaType.botNodesAppendChildren || deltaType.processNodesAppendChildren;
                        if (deltaNodesAppendChildren) {
                            const deltaTargetUid = deltaNodesAppendChildren.targetUid;
                            const deltaNodes = deltaNodesAppendChildren.nodes;
                            if (deltaNodes?.length > 0) {
                                nextNodes = replaceNodes(
                                    nextNodes,
                                    (node) => node.uid === deltaTargetUid,
                                    (nodes) => nodes.map((node) => {
                                        if (node.uid !== deltaTargetUid) {
                                            return node;
                                        }
                                        return {
                                            ...node,
                                            children: node.children?.length > 0
                                                ? [
                                                    ...node.children,
                                                    ...getDeltaNodes(node.children.at(-1), deltaNodes),
                                                ]
                                                : getDeltaNodes(node, deltaNodes),
                                        };
                                    }),
                                );
                            }
                            return;
                        }
                        const deltaNodesAppendBranches = deltaType.botNodesAppendBranches || deltaType.processNodesAppendBranches;
                        if (deltaNodesAppendBranches) {
                            const deltaTargetUid = deltaNodesAppendBranches.targetUid;
                            const deltaNodes = deltaNodesAppendBranches.nodes;
                            if (deltaNodes?.length > 0) {
                                nextNodes = replaceNodes(
                                    nextNodes,
                                    (node) => node.uid === deltaTargetUid,
                                    (nodes) => nodes.map((node) => {
                                        if (node.uid !== deltaTargetUid) {
                                            return node;
                                        }
                                        return {
                                            ...node,
                                            branches: node.branches?.length > 0
                                                ? [
                                                    ...node.branches,
                                                    ...getDeltaNodes(node.branches.at(-1), deltaNodes),
                                                ]
                                                : getDeltaNodes(node, deltaNodes),
                                        };
                                    }),
                                );
                            }
                            return;
                        }
                        const deltaNodesAppendAtCursor = deltaType.botNodesAppendAtCursor || deltaType.processNodesAppendAtCursor;
                        if (deltaNodesAppendAtCursor) {
                            const {cursor, collapsed} = this.state;
                            const deltaNodes = deltaNodesAppendAtCursor.nodes;
                            if (deltaNodes?.length > 0) {
                                const deltaTargetNode = getNode(nextNodes, (node) => node.uid === cursor?.uid);
                                if (!deltaTargetNode) {
                                    nextNodes = [
                                        ...nextNodes,
                                        ...getDeltaNodes(nextNodes.at(-1), deltaNodes),
                                    ];
                                    return;
                                }
                                const {commandMap} = this.props;
                                const command = commandMap[getPackageCommandKey(deltaTargetNode)];
                                if (command?.nestable && !collapsed.has(`node:${deltaTargetNode.uid}`)) {
                                    nextNodes = replaceNodes(
                                        nextNodes,
                                        (node) => node.uid === deltaTargetNode.uid,
                                        (nodes) => nodes.map((node) => {
                                            if (node.uid !== deltaTargetNode.uid) {
                                                return node;
                                            }
                                            return {
                                                ...node,
                                                children: node.children?.length > 0
                                                    ? [
                                                        ...getDeltaNodes(node, deltaNodes),
                                                        ...node.children,
                                                    ]
                                                    : getDeltaNodes(node, deltaNodes),
                                            };
                                        }),
                                    );
                                    return;
                                }
                                nextNodes = replaceNodes(
                                    nextNodes,
                                    (node) => node.uid === deltaTargetNode.uid,
                                    (nodes) => {
                                        const index = nodes.findIndex((node) => node.uid === deltaTargetNode.uid);
                                        return [
                                            ...nodes.slice(0, index + 1),
                                            ...getDeltaNodes(nodes[index], deltaNodes),
                                            ...nodes.slice(index + 1),
                                        ];
                                    },
                                );
                            }
                            return;
                        }
                        const deltaNodeReplace = deltaType.botNodeReplace || deltaType.processNodeReplace;
                        if (deltaNodeReplace) {
                            const deltaNode = deltaNodeReplace.node;
                            nextNodes = replaceNodes(
                                nextNodes,
                                (node) => node.uid === deltaNode.uid,
                                (nodes) => nodes.map((node) => {
                                    return node.uid === deltaNode.uid ? deltaNode : node;
                                }),
                            );
                            return;
                        }
                        const deltaNodesReplace = deltaType.botNodesReplace || deltaType.processNodesReplace;
                        if (deltaNodesReplace) {
                            if (deltaNodesReplace.nodes?.length > 0) {
                                deltaNodesReplace.nodes.forEach((deltaNode) => {
                                    nextNodes = replaceNodes(
                                        nextNodes,
                                        (node) => node.uid === deltaNode.uid,
                                        (nodes) => nodes.map((node) => {
                                            return node.uid === deltaNode.uid ? deltaNode : node;
                                        }),
                                    );
                                });
                            }
                            return;
                        }
                        const deltaNodeRemove = deltaType.botNodeRemove || deltaType.processNodeRemove;
                        if (deltaNodeRemove) {
                            const deltaTargetUid = deltaNodeRemove.targetUid;
                            nextNodes = replaceNodes(
                                nextNodes,
                                (node) => node.uid === deltaTargetUid,
                                (nodes) => nodes.filter((node) => node.uid !== deltaTargetUid),
                            );
                            return;
                        }
                        const deltaVariableAdd = deltaType.botVariableAdd || deltaType.processVariableAdd;
                        if (deltaVariableAdd) {
                            const deltaVariableKey = getVariableKey(deltaVariableAdd.variable.name);
                            nextVariables = [
                                ...nextVariables.filter((variable) => variable.key !== deltaVariableKey),
                                {...deltaVariableAdd.variable, key: deltaVariableKey},
                            ];
                            return;
                        }
                        const deltaVariableReplace = deltaType.botVariableReplace || deltaType.processVariableReplace;
                        if (deltaVariableReplace) {
                            const deltaVariableKey = getVariableKey(deltaVariableReplace.variable.name);
                            nextVariables = nextVariables.map((variable) => {
                                return variable.key !== deltaVariableKey
                                    ? variable
                                    : {...deltaVariableReplace.variable, key: deltaVariableKey};
                            });
                            return;
                        }
                        const deltaVariableRemove = deltaType.botVariableRemove || deltaType.processVariableRemove;
                        if (deltaVariableRemove) {
                            const deltaVariableKey = getVariableKey(deltaVariableRemove.name);
                            nextVariables = nextVariables.filter((variable) => variable.key !== deltaVariableKey);
                            return;
                        }
                    });
                    if (lastNodes !== nextNodes || lastVariables !== nextVariables) {
                        this.handleNodesChange({nodes: nextNodes, variables: nextVariables});
                    }
                }
                if (directive) {
                    if (directive.fileOpen) {
                        // TODO: do a redirection based on file type and id
                    }
                }
            } : null);
        });
    };

    handleChatbotRecorderCurrentTabIdChange = (chatbotRecorderCurrentTabId) => {
        this.setState({chatbotRecorderCurrentTabId});
    };

    handlePreferencesUpdate = (preferences) => {
        const values = preferences?.[SCOPE_BOT_EDITOR]?.values;
        if (!values) {
            return;
        }
        let {lastEditorCanvas, collapsed, sizes, assistantStyle} = this.state;
        const canvasView = values[BOT_EDITOR_CANVAS_VIEW] || 'flow';
        switch (canvasView) {
            case 'list':
                lastEditorCanvas = 'list';
                collapsed = this.state.collapsed.add(KEY_CANVAS_FLOW).remove(KEY_CANVAS_LIST).clone();
                break;
            case 'both':
                lastEditorCanvas = 'both';
                collapsed = this.state.collapsed.remove(KEY_CANVAS_FLOW).remove(KEY_CANVAS_LIST).clone();
                break;
            case 'flow':
            default:
                lastEditorCanvas = 'flow';
                collapsed = this.state.collapsed.remove(KEY_CANVAS_FLOW).add(KEY_CANVAS_LIST).clone();
                break;
        }
        const sizePalette = parseInt(values[BOT_EDITOR_SIZE_PALETTE]);
        if (sizePalette >= 0) {
            sizes = sizes.set(KEY_PALETTE, sizePalette).clone();
        }
        const sizeDetails = parseInt(values[BOT_EDITOR_SIZE_DETAILS]);
        if (sizeDetails >= 0) {
            sizes = sizes.set(KEY_DETAILS, sizeDetails).clone();
        }
        const assistantStyleDockTo = values[BOT_EDITOR_ASSISTANT_STYLE_DOCK_TO] ?? 'NONE';
        const assistantStyleTop = parseInt(values[BOT_EDITOR_ASSISTANT_STYLE_TOP], 10) || null;
        const assistantStyleLeft = parseInt(values[BOT_EDITOR_ASSISTANT_STYLE_LEFT], 10) || null;
        const assistantStyleHeight = parseInt(values[BOT_EDITOR_ASSISTANT_STYLE_HEIGHT], 10) || null;
        const assistantStyleWidth = parseInt(values[BOT_EDITOR_ASSISTANT_STYLE_WIDTH], 10) || null;

        if (assistantStyleDockTo !== 'NONE' || assistantStyleTop > 0 || assistantStyleLeft > 0 || assistantStyleHeight > 0 || assistantStyleWidth > 0) {
            assistantStyle = {
                ...Assistant.INITIAL_STYLE,
                dockedTo: assistantStyleDockTo,
            };

            if (assistantStyleTop > 0) {
                assistantStyle.insetBlockStart = assistantStyleTop;
            }
            if (assistantStyleLeft > 0) {
                assistantStyle.insetInlineStart = assistantStyleLeft;
            }
            if (assistantStyleHeight > 0) {
                assistantStyle.blockSize = assistantStyleHeight;
            }
            if (assistantStyleWidth > 0) {
                assistantStyle.inlineSize = assistantStyleWidth;
            }
        }
        if (lastEditorCanvas !== this.state.lastEditorCanvas || collapsed !== this.state.collapsed || sizes !== this.state.sizes || assistantStyle !== this.state.assistantStyle) {
            this.setState({
                lastEditorCanvas,
                collapsed,
                sizes,
                assistantStyle,
            });
        }
    };

    getAutomationTypeLabel = (automationType) => {
        const {t} = this.props;
        switch (automationType) {
            case FILE_TYPE_TASKBOT:
                return t('resource-taskbot-label');
            case FILE_TYPE_TASKBOT_TEMPLATE:
                return t('resource-taskbot-template');
            case FILE_TYPE_HEADLESSBOT:
                return t('resource-headlessbot');
            case FILE_TYPE_PROCESS:
                return t('resource-process-label');
            case FILE_TYPE_PROCESS_TEMPLATE:
                return t('resource-process-template');
        }
        return t('resource-taskbot-label');
    };

    getChatbotContentJson = () => {
        const {getFieldValue} = this.props;
        const values = Object.keys(DEFAULT_VALUES).reduce((result, key) => {
            result[key] = getFieldValue(key);
            return result;
        }, {});
        const content = this.getContent(values);
        return JSON.stringify(content);
    };

    getContent = (values) => {
        const {
            automationFile,
            automationType,
            packages: packageVersions,
            globalValues,
            fileInterfaceMap,
            automationReport,
            featureFlags,
            licenseFlags,
            hasFeatureCloudTriggers,
            hasFeatureProcessWebTriggers,
            hasFeatureProcessEditorV2Save,
            hasFeatureProcessEditorV1FallbackSave,
        } = this.props;
        const packageDetails = getPackageDetails(packageVersions, automationFile, hasFeatureCloudTriggers, hasFeatureProcessWebTriggers);
        const taskAliases = getTaskAliases(automationType, values.nodes, packageDetails, (s) => s);
        const usedPackageSet = getUsedPackageSet(
            values.triggers,
            values.nodes,
            values.orphans,
            values.swimlanes,
            globalValues,
            taskAliases,
            getVariableMap(packageDetails.variableGroups, packageDetails.variableMap, values.variables),
            packageDetails,
        );
        const {hasContentErrors, content} = getTaskbotContent({
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
        });
        const getHasErrors = () => {
            if (!getAutomationTypeHasErrors(automationType)) {
                return false;
            }
            if (hasContentErrors || automationReport.hasErrors) {
                return true;
            }
            if (!packageVersions
                ? usedPackageSet.size > 0
                : packageVersions.some((pkg) => usedPackageSet.has(pkg.name) && pkg.isPackageDisabled && pkg.isPackageRestricted)
            ) {
                return true;
            }
            const getIsNodeInvalid = (node, isBranch, parents) => {
                if (!node) {
                    return false;
                }
                const command = packageDetails.commandMap[getPackageCommandKey(node)];
                if (!command) {
                    return true;
                }
                if (!isBranch && command.branchOf) {
                    return true;
                }
                if (command.ancestorOf && (
                    !parents.length ||
                    !parents.some((parent) => parent.packageName === command.packageName && parent.commandName === command.ancestorOf)
                )) {
                    return true;
                }
                if (node.branches?.length && node.branches.some((node) => getIsNodeInvalid(node, true, parents))) {
                    return true;
                }
                if (node.children?.length > 0) {
                    const childParents = [...parents, node];
                    if (node.children.some((node) => getIsNodeInvalid(node, false, childParents))) {
                        return true;
                    }
                }
                return false;
            };
            if (values.nodes?.some((node) => getIsNodeInvalid(node, false, []))) {
                return true;
            }
            return false;
        };
        return {
            dependencies: values.dependencies,
            hasErrors: getHasErrors(),
            content,
        };
    };

    getProcessLayoutConfig = () => {
        const config = {};
        const rendererElement = document.querySelector('[data-path="TaskbotCanvasProcess.Renderer"]');
        if (rendererElement) {
            const viewportElement = document.querySelector('[data-path="TaskbotCanvasProcess.Viewport"]');
            if (viewportElement) {
                const dataZoom = viewportElement.getAttribute('data-zoom');
                if (dataZoom) {
                    config.zoom = Number(dataZoom);
                }
                const dataPanY = viewportElement.getAttribute('data-pan-y');
                const dataPanX = viewportElement.getAttribute('data-pan-x');
                if (dataPanY && dataPanX) {
                    config.pan = {
                        y: Math.floor(Number(dataPanY)),
                        x: Math.floor(Number(dataPanX)),
                    };
                }
                const dataMouseY = viewportElement.getAttribute('data-mouse-y');
                const dataMouseX = viewportElement.getAttribute('data-mouse-x');
                if (dataMouseY && dataMouseX) {
                    config.mousePosition = {
                        y: Math.floor(Number(dataMouseY)),
                        x: Math.floor(Number(dataMouseX)),
                    };
                }
            }
            const rendererRect = rendererElement.getBoundingClientRect();
            if (rendererRect) {
                config.canvas = {
                    height: Math.floor(rendererRect.height),
                    width: Math.floor(rendererRect.width),
                };
            }
        }
        return config;
    };

    getUnusedVariables = () => {
        const {getFieldValue} = this.props;
        const variables = getFieldValue('variables') || EMPTY_ARRAY;
        if (!variables.length) {
            return [];
        }
        const usedSet = this.selectReferencedVariablesSet(this.props).clone();
        return variables.filter((variable) => !variable.output && !variable.workItem && !usedSet.has(getVariableKey(variable.name)));
    };

    processDebugPoints = () => {
        const {getFieldValue, automationFile, actions} = this.props;
        const {debugPointsMap} = this.state;
        const lastBreakpoints = debugPointsMap.get(automationFile.path).breakpoints;
        const lastWatchers = debugPointsMap.get(automationFile.path).watchVariables;
        const nodes = getFieldValue('nodes');
        const variables = getFieldValue('variables');
        const breakpointsSet = new Set(lastBreakpoints);
        const nextBreakpointsSet = new Set();
        const checkNodes = (allNodes) => {
            if (!allNodes) {
                return;
            }
            allNodes.forEach((node) => {
                if (breakpointsSet.has(node.uid)) {
                    nextBreakpointsSet.add(node.uid);
                }
                if (node.children) {
                    checkNodes(node.children);
                }
                if (node.branches) {
                    checkNodes(node.branches);
                }
            });
        };
        checkNodes(nodes);
        const nextBreakpoints = [...nextBreakpointsSet];
        nextBreakpoints.sort();
        let isBreakpointsChanged = lastBreakpoints.length > 0 ? true : false;
        if (nextBreakpoints.length === lastBreakpoints.length) {
            if (lastBreakpoints.every((nodeUid) => nextBreakpointsSet.has(nodeUid))) {
                isBreakpointsChanged = false;
            }
        }
        const watchersSet = new Set([...lastWatchers]);
        const nextWatchersSet = new Set();
        variables.forEach((variable) => {
            if (watchersSet.has(variable.key)) {
                nextWatchersSet.add(variable.key);
            }
        });
        const nextWatchers = [...nextWatchersSet];
        const lastWatchersList = [...lastWatchers];
        let isWatchersChanged = lastWatchersList.length > 0 ? true : false;
        if (nextWatchersSet.size === lastWatchersList.length) {
            if (lastWatchersList.every((watcher) => nextWatchersSet.has(watcher))) {
                isWatchersChanged = false;
            }
        }
        if (isBreakpointsChanged || isWatchersChanged) {
            const breakpoints = nextBreakpoints.map((nodeUid) => ({nodeUid, enabled: true}));
            const watchVariables = nextWatchers.map((variableName) => ({variableName}));

            actions.repositoriesSetDebugPoints(automationFile.id, {
                watchVariables,
                breakpoints,
            });
        }
    };

    startBackgroundDesktopSession = (pkg) => {
        const {automationFile, startBackgroundDesktopSession} = this.props;
        startBackgroundDesktopSession(automationFile, pkg);
    };

    logEditTime = () => {
        const {automationFile} = this.props;
        if (!automationFile) {
            return;
        }
        const now = Date.now();
        logEvent(EVENT_TYPE.BOTCREATION, {
            fileId: automationFile.id,
            botName: automationFile.name,
            path: automationFile.path,
            version: automationFile.productionVersion,
            timeStamp: new Date(),
            duration: now - this.initialEditTime,
        });
        this.initialEditTime = now;
    };

    componentDidMount() {
        const {actions} = this.props;
        this._isMounted = true;
        this.selectCheckWorkspace(this.props);
        this.selectGetDebugPoints(this.props);
        this.selectInitialize(this.props);
        this.selectGetAutomation(this.props, this.state);
        this.selectGetInitialPackageVersions(this.props, this.state);
        this.selectGetMissingPackageVersions(this.props);
        this.selectGetFileInterfaces(this.props);
        this.selectError(this.props);
        this.selectRefresh(this.props);
        this.selectDebuggerReady(this.props);
        // Log bot editing time every n seconds
        this.initialEditTime = Date.now();
        this.logInterval = setInterval(this.logEditTime, LOG_EDIT_INTERVAL);
        this.globalClipboardInterval = setInterval(() => {
            if (!this._isMounted) {
                return;
            }

            const globalClipboardUid = fromLocalStorage('globalClipboardUid', null);
            if (this.state.globalClipboardUid !== globalClipboardUid) {
                this.setState({globalClipboardUid});
            }
        }, GLOBAL_CLIPBOARD_INTERVAL);
        actions.botsSettingsResiliencySettingsGet();
        getEditorSettings()
            .then((editorSettings) => this.setState({editorSettings}));
        window.AutomationEditor = {
            desktopSend: this.handleDesktopSend,
            debuggerSend: this.handleDebuggerSend,
        };
    }

    componentDidUpdate(lastProps) {
        this.selectCheckWorkspace(this.props);
        this.selectGetDebugPoints(this.props);
        this.selectInitialize(this.props);
        this.selectGetAutomation(this.props, this.state);
        this.selectGetInitialPackageVersions(this.props, this.state);
        this.selectGetMissingPackageVersions(this.props);
        this.selectGetFileInterfaces(this.props);
        this.selectError(this.props);
        this.selectRefresh(this.props);
        this.selectDebuggerReady(this.props);
        // Check for language change and warn user to reload
        if (this.props.languageCode !== lastProps.languageCode) {
            if (this.props.route.mode === 'edit') {
                setTimeout(() => this.handleCheckUnsaved(() => this.handleRefresh(), {silent: true}));
            }
            else {
                setTimeout(() => this.handleRefresh());
            }
        }
    }

    componentWillUnmount() {
        this._isMounted = false;
        clearTimeout(this.saveTimeout);
        clearTimeout(this.sizeTimeout);
        clearInterval(this.logInterval);
        clearTimeout(this.globalClipboardInterval);
        this.logEditTime();
        destroyNodeForms();
        const {loadPending, actions, params: {fileId}} = this.props;
        loadPending?.cancel?.();
        const {runProcessPending} = this.state;
        runProcessPending?.cancel?.();
        actions.repositoriesFileReset();
        if (fileId) {
            actions.repositoriesErrorReset(`update-file-${fileId}`);
        }
        window.AutomationEditor = null;
    }

    renderKeyBindingModal = () => {
        const {showKeyBindings} = this.state;
        if (!showKeyBindings) {
            return null;
        }
        const {automationType, canRunNow, canDebug, route: {mode}} = this.props;
        return (
            <TaskbotKeyBinding
                mode={mode}
                automationType={automationType}
                canRunNow={canRunNow}
                canDebug={canDebug}
                onHide={this.handleKeyboardBindingToggle}
            />
        );
    };

    renderPackageIcon = (pkg) => {
        if (!pkg) {
            return null;
        }
        const {usedPackageSet} = this.props;
        if (usedPackageSet.has(pkg.name)) {
            if (pkg.status === PACKAGE_STATUS_DISABLED || pkg.permissions?.botRestriction) {
                return <Icon aa="package--default" aaModifier="warning--error" large={false}/>;
            }
            const packageNames = this.selectPackageNames(this.props);
            if (!packageNames.has(pkg.name)) {
                return <Icon aa="package--default" aaModifier="warning--error" large={false}/>;
            }
            return <Icon aa="package--default" aaModifier="success" large={false}/>;
        }
        return <Icon aa="package--default" large={false}/>;
    };

    renderPackageDetails = (pkg) => {
        if (!pkg) {
            return null;
        }

        const {
            loadPending, updatePending,
            automationFile, automationType,
            packages, packageVersions, packageVersionsPending, packageVersionsError,
            getFieldValue,
            hasFeaturePackageUpdateEditorApi,
            t,
        } = this.props;
        const error = packageVersionsError[`get-taskbot-package-versions-${pkg.name}`];
        if (error) {
            return <ErrorMessage error={error}/>;
        }
        const versions = packageVersions[pkg.name];
        if (!versions?.length) {
            return packageVersionsPending[`get-taskbot-package-versions-${pkg.name}`]
                ? null
                : (
                    <ErrorMessage
                        error={{
                            title: t('taskbot:validation-error-package-missing-version-title'),
                            body: t('taskbot:validation-error-package-missing-version'),
                        }}
                    />
                );
        }
        const mode = this.selectMode(this.props);
        const {packageVersionChoice, isGettingFileInterfaces} = this.state;
        const currentPackage = packages.find((other) => other.name === pkg.name);
        const currentPackageVersion = packageVersionChoice[pkg.name] || currentPackage?.packageVersion;
        const processedVersions = versions.sort((a, b) => compareSemanticVersions(b.packageVersion, a.packageVersion));
        const versionOptions = processedVersions.map((version) => {
            return {
                label: version.packageVersion,
                description: version.status === PACKAGE_STATUS_DEFAULT ? t('packages:default-label') : version.status === PACKAGE_STATUS_DISABLED ? t('packages:disabled-label') : null,
                value: version.packageVersion,
                renderIcon: () => <Icon aa="package--default" aaModifier={version.packageVersion === currentPackage?.packageVersion ? 'success' : null} large={false}/>,
            };
        });
        let versionValue = currentPackageVersion;
        let versionError = null;
        if (!versionValue) {
            versionValue = '';
            versionError = t('taskbot:validation-error-package-missing-version-title');
        }
        const formPackage = getFieldValue('packages')?.find((formPkg) => formPkg?.name === pkg.name);
        if (formPackage?.version) {
            if (!processedVersions.some((pkg) => pkg.packageVersion === formPackage.version)) {
                versionOptions.unshift({
                    label: formPackage.version,
                    value: formPackage.version,
                    renderIcon: () => <Icon aa="package--default" aaModifier="warning--error" large={false}/>,
                });
            }
            if (!versionValue) {
                versionValue = formPackage.version;
            }
        }
        else if (!versionOptions.some((option) => option.value === versionValue)) {
            versionOptions.unshift({
                label: '',
                value: '',
                renderIcon: () => <Icon aa="package--default" aaModifier="warning--error" large={false}/>,
            });
        }
        const versionSelect = (
            <RioSelectInput
                name="version"
                onChange={(version) => this.setState({
                    packageVersionChoice: {
                        ...packageVersionChoice,
                        [pkg.name]: version,
                    },
                })}
                value={versionValue}
                error={versionError}
                options={versionOptions}
                optionFlowDirection="ROW"
                isSelectedDescriptionVisible
                isReadOnly={mode === 'view'}
                isDisabled={mode === 'view' ? false : Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                searchMode="SEARCH_QUERY"
            />
        );
        const button = mode === 'view' ? null : (
            <CommandButton
                name="change"
                onClick={() => {
                    if (getAutomationTypeIsTask(automationType) && hasFeaturePackageUpdateEditorApi) {
                        this.setState({
                            packageUpdate: {
                                automationId: automationFile.id,
                                packages: [{packageName: pkg.name, packageVersion: versionValue}],
                                onDone: (content) => {
                                    const nodes = content.nodes ?? [];
                                    const triggers = content.triggers ?? [];
                                    const variables = content.variables?.map((variable) => ({...variable, key: getVariableKey(variable.name)})) ?? [];
                                    const packages = content.packages?.map((pkg) => ({name: pkg.name, version: pkg.version})) ?? [];
                                    // TODO: API should also migrate package settings
                                    this.setState({packageUpdate: null}, () => {
                                        this.handleNodesChange({nodes, triggers, variables, packages});
                                        setTimeout(() => this.handleCheckUnsaved(), 100);
                                    });
                                },
                            },
                        });
                        return;
                    }
                    let found = false;
                    const lastPackages = getFieldValue('packages');
                    const nextPackage = {
                        name: pkg.name,
                        version: versionValue,
                    };
                    const nextPackages = lastPackages.map((other) => {
                        if (other.name !== pkg.name) {
                            return other;
                        }

                        found = true;
                        return nextPackage;
                    });
                    if (!found) {
                        nextPackages.push(nextPackage);
                    }
                    const lastPackageVersion = packageVersions[pkg.name]?.find((other) => other.packageVersion === currentPackage?.packageVersion);
                    const nextPackageVersion = packageVersions[pkg.name]?.find((other) => other.packageVersion === versionValue);
                    this.handlePackagesMigrationChange(nextPackages, lastPackageVersion, nextPackageVersion);
                }}
                disabled={Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit' || versionValue === currentPackage?.packageVersion || versionValue === formPackage?.version || versionError)}
                recommended
            >
                {t('taskbot:action-package-enable')}
            </CommandButton>
        );
        return (
            <>
                {Boolean(pkg.permissions?.botRestriction) && (
                    <ErrorMessage
                        error={{
                            title: t('taskbot:validation-error-package-restricted-title'),
                            body: t('taskbot:validation-error-package-restricted'),
                        }}
                    />
                )}
                <div className="taskbot-edit-page__package__versions">
                    <div className="taskbot-edit-page__package__versions__cell taskbot-edit-page__package__versions__cell--select">
                        {versionSelect}
                    </div>
                    <div className="taskbot-edit-page__package__versions__cell taskbot-edit-page__package__versions__cell--button">
                        {button}
                    </div>
                </div>
                {!currentPackage
                    ? (
                        <ErrorMessage
                            error={{
                                title: t('taskbot:validation-error-package-missing-version-title'),
                                body: t('taskbot:validation-error-package-missing-version'),
                            }}
                        />
                    )
                    : pkg.status === PACKAGE_STATUS_DISABLED
                        ? (
                            <ErrorMessage
                                error={{
                                    title: t('taskbot:validation-error-package-disabled-title'),
                                    body: t('taskbot:validation-error-package-disabled'),
                                }}
                            />
                        )
                        : null}
            </>
        );
    };

    renderPackageUpdate() {
        const {automationFile} = this.props;
        const {packageUpdate} = this.state;
        if (!automationFile || !packageUpdate) {
            return null;
        }
        return (
            <RepositoryActionUpdateContentPackages
                automationId={packageUpdate.automationId}
                packages={packageUpdate.packages}
                onHide={() => this.setState({packageUpdate: null})}
                onDone={packageUpdate.onDone}
            />
        );
    }

    renderCopyMetadata() {
        const {copyMetadata} = this.state;
        if (!copyMetadata) {
            return null;
        }
        return (
            <RepositoryActionMetadataCopy
                sourceFileId={copyMetadata.sourceFileId}
                sourceMetadataPaths={copyMetadata.sourceMetadataPaths}
                targetFileId={copyMetadata.targetFileId}
                onHide={() => this.setState({copyMetadata: null})}
                onDone={copyMetadata.onDone}
            />
        );
    }

    renderGlobalClipboardMessage() {
        const {globalClipboardMessage} = this.state;
        if (!globalClipboardMessage) {
            return null;
        }
        const {t} = this.props;
        if (globalClipboardMessage.onContinue) {
            return (
                <Prompt
                    key={globalClipboardMessage.id}
                    id={globalClipboardMessage.id}
                    theme={globalClipboardMessage.theme}
                    title={globalClipboardMessage.renderTitle ? globalClipboardMessage.renderTitle() : null}
                    items={globalClipboardMessage.items}
                    labelCancel={t('label-cancel')}
                    labelSubmit={t('label-continue')}
                    onHide={this.handleGlobalClipboardMessageClose}
                    onSubmit={globalClipboardMessage.onContinue}
                    show
                >
                    {globalClipboardMessage.renderMessage ? globalClipboardMessage.renderMessage() : null}
                </Prompt>
            );
        }
        return (
            <Alert
                key={globalClipboardMessage.id}
                id={globalClipboardMessage.id}
                theme={globalClipboardMessage.theme}
                title={globalClipboardMessage.renderTitle ? globalClipboardMessage.renderTitle() : null}
                items={globalClipboardMessage.items}
                labelOk={t('label-close')}
                onHide={this.handleGlobalClipboardMessageClose}
                show
            >
                {globalClipboardMessage.renderMessage ? globalClipboardMessage.renderMessage() : null}
            </Alert>
        );
    }

    renderInputVariableConfirm() {
        const {inputVariableShow, inputVariableList, inputVariableValues} = this.state;
        if (!inputVariableShow) {
            return null;
        }
        const {desktop, windows, windowGroups, browserTabs, params: {fileId, workspaceName}, t} = this.props;
        const recorderPackage = this.selectRecorderPackage(this.props);
        return (
            <TaskbotInputVariablesPrompt
                title={t('taskbot:set-input-variables-title')}

                variableList={inputVariableList}
                variableValues={inputVariableValues}

                recorderPackage={recorderPackage}

                workspaceName={workspaceName}
                fileId={fileId}
                desktop={desktop}
                windows={windows}
                windowGroups={windowGroups}
                browserTabs={browserTabs}

                onWindowsRequest={this.handleWindowsRequest}
                onBrowserTabsRequest={this.handleBrowserTabsRequest}
                onFileRequest={this.handleFileRequest}

                onHide={this.handleInputVariablesCancel}
                onSubmit={this.handleInputVariablesConfirm}

                modal
                show
            />
        );
    }

    renderMessage() {
        const {message} = this.state;
        if (!message) {
            return null;
        }
        const {t} = this.props;
        let body = null;
        if (typeof message.body === 'string') {
            body = t(message.body);
        }
        else if (message.body) {
            body = message.body;
        }
        return (
            <Alert
                key="message"
                id={message.id || 'taskbot-edit-page__message'}
                title={t(message.title)}
                labelOk={t('action-close')}
                onHide={this.handleMessageClose}
                show
            >
                {body}
                {Boolean(message.code) && <pre className="taskbot-edit-page__message-code g-scroller">{message.code}</pre>}
            </Alert>
        );
    }

    renderContent() {
        const {
            automationFile,
            automationType,
            automationIntendedPlatform,
            featureFlags,
            licenseFeatures,
            fileInterfaceMap,
            loadPending, updatePending,
            pristine,
            taskAliases,
            globalValues,
            automationReport,
            packageDetails, packages, packageVersionsPending, getFieldValue, dependencyFields,
            desktop, windows, windowGroups, browserTabs,
            debugger: dbugger,
            running,
            onDebuggerStep, onDebuggerPlay,
            onDebuggerStepIn, onDebuggerStepOut,
            params: {fileId, workspaceName},
            secureRecording,
            canRunNow,
            canDebug,
            canAccessAutomationPriority,
            t,
        } = this.props;
        const {
            tabId,
            isGettingFileInterfaces,
            groups, collapsed, opened, sizes,
            cursor, undo, redo, clipboard, globalClipboardUid,
            editorSettings,
            externalOptions,
            panZoom,
            search, searchParameters, debugPointsMap,
        } = this.state;
        const hasEditorSettingSuggestNextActions = editorSettings[EDITOR_SETTING_SUGGEST_NEXT_ACTIONS];
        const mode = this.selectMode(this.props);
        const triggers = getFieldValue('triggers') || EMPTY_ARRAY;
        const nodes = getFieldValue('nodes') || EMPTY_ARRAY;
        const orphans = getFieldValue('orphans') || EMPTY_ARRAY;
        const swimlanes = getFieldValue('swimlanes') || EMPTY_ARRAY;
        const swimlaneStacking = getFieldValue('swimlaneStacking') || 'LEFT_TO_RIGHT';
        const variables = getFieldValue('variables') || EMPTY_ARRAY;
        const properties = getFieldValue('properties') || EMPTY_OBJECT;
        const key = `${workspaceName}_${fileId}_${tabId}`;
        switch (tabId) {
            case 'editor': {
                const canEdit = mode === 'edit';
                const canRecord = Boolean(canEdit && getAutomationTypeHasRecorder(automationType));
                return (
                    <TaskbotEditorLoader
                        key={key}

                        featureFlags={featureFlags}
                        licenseFeatures={licenseFeatures}

                        packageDetails={packageDetails}

                        file={automationFile}
                        automationType={automationType}
                        automationIntendedPlatform={automationIntendedPlatform}
                        automationReport={automationReport}
                        hasChanges={!pristine}
                        onFileOpen={this.handleFileOpen}

                        search={search}
                        searchParameters={searchParameters}
                        searchResults={this.selectSearchResults(this.props, this.state)}
                        onSearchChange={this.handleSearchChange}
                        onSearchParametersChange={this.handleSearchParametersChange}
                        onAssistantPageOpen={this.handleAssistantPageOpen}

                        mode={mode}
                        workspaceName={workspaceName}
                        globalValues={globalValues}
                        taskAliases={taskAliases}

                        loading={loadPending}
                        disabled={Boolean(loadPending || updatePending || isGettingFileInterfaces)}
                        packages={packages}

                        triggers={triggers}
                        nodes={nodes}
                        orphans={orphans}
                        swimlanes={swimlanes}
                        swimlaneStacking={swimlaneStacking}
                        onNodesChange={canEdit ? this.handleNodesChange : null}

                        variables={variables}
                        onVariablesChange={canEdit ? this.handleVariablesChange : null}
                        getUnusedVariables={this.getUnusedVariables}

                        hasProcessCodeVersion0={getAutomationTypeIsProcess(automationType) && (properties?.processCodeVersion ?? '0') === '0'}

                        sizes={sizes}
                        onResize={this.handleResize}

                        collapsed={collapsed}
                        onCollapsedChange={this.handleCollapsedChange}

                        opened={opened}
                        onOpenedChange={this.handleOpenedChange}

                        groups={groups}
                        onGroupsChange={this.handleGroupsChange}

                        debugPointsMap={debugPointsMap}
                        onDebugPointsMapChange={this.handleDebugPointsChange}

                        cursor={cursor}
                        onCursorChange={this.handleCursorChange}

                        undo={undo}
                        onUndo={canEdit ? this.handleUndo : null}

                        redo={redo}
                        onRedo={canEdit ? this.handleRedo : null}

                        clipboard={clipboard}
                        onCopy={canEdit ? this.handleCopy : null}
                        onGlobalCopy={workspaceName === WORKSPACE_PRIVATE && automationFile && getAutomationTypeHasGlobalClipboard(automationType) ? this.handleGlobalCopy : null}
                        onGlobalPaste={canEdit && getAutomationTypeHasGlobalClipboard(automationType) ? this.handleGlobalPaste : null}
                        hasGlobalClipboard={Boolean(globalClipboardUid && getAutomationTypeHasGlobalClipboard(automationType))}

                        externalOptions={externalOptions}
                        onExternalOptionsChange={this.handleExternalOptionsChange}

                        fileId={fileId}
                        fileInterfaceMap={fileInterfaceMap}

                        desktop={desktop}
                        windows={windows}
                        windowGroups={windowGroups}
                        browserTabs={browserTabs}
                        onWindowsRequest={this.handleWindowsRequest}
                        onBrowserTabsRequest={this.handleBrowserTabsRequest}

                        onObjectCaptureRequest={this.handleObjectCaptureRequest}
                        onAnchorCaptureRequest={this.handleAnchorCaptureRequest}
                        onImageCaptureRequest={this.handleImageCaptureRequest}
                        onCoordinateCaptureRequest={this.handleCoordinateCaptureRequest}
                        onRegionCaptureRequest={this.handleRegionCaptureRequest}

                        onFileRequest={this.handleFileRequest}

                        onOperationButtonRequest={this.handleOperationButtonRequst}
                        onOperationTreeRequest={this.handleOperationTreeRequest}
                        onOperationTableRequest={this.handleOperationTableRequest}
                        onOperationSelectRequest={this.handleOperationSelectRequest}

                        onRecorderStart={canRecord ? this.handleRecorderStart : null}
                        secureRecording={secureRecording}

                        debugger={mode === 'debug' && canDebug ? dbugger : null}
                        onDebuggerEnter={!canDebug ? null : () => this.setState({assistantShow: true, assistantPage: 'debugger'})}
                        onDebuggerStart={!canDebug ? null : this.handleDebuggerStart}
                        onDebuggerStep={!canDebug ? null : onDebuggerStep}
                        onDebuggerStepIn={!canDebug ? null : onDebuggerStepIn}
                        onDebuggerStepOut={!canDebug ? null : onDebuggerStepOut}
                        onDebuggerPlay={!canDebug ? null : onDebuggerPlay}
                        onDebuggerStop={!canDebug ? null : this.handleDebuggerStop}
                        onDebuggerFrameChange={!canDebug ? null : this.handleDebuggerFrameChange}

                        running={running}
                        onRunStart={!canRunNow ? null : this.handleRunStart}
                        onRunFromStart={!canRunNow ? null : this.handleRunFromStart}

                        startBackgroundDesktopSession={this.startBackgroundDesktopSession}

                        onTabChange={this.handleTabChange}

                        panZoom={panZoom}
                        onPanZoomChange={this.handlePanZoomChange}

                        onSave={canEdit ? this.handleSave : null}
                        onCheckUnsaved={canEdit ? this.handleCheckUnsaved : null}
                        onApplyNodeDetails={this.handleApplyNodeDetails}

                        hasEditorSettingSuggestNextActions={hasEditorSettingSuggestNextActions}

                        canRun={canRunNow}
                        canDebug={canDebug}
                        canRecord={canRecord}
                    />
                );
            }
            case 'dependencies': {
                const activeTabId = this.state.fileDependencyActiveTabId || 'dependencies';
                return (
                    <div key={key} className="taskbot-edit-page__page">
                        <div className="taskbot-edit-page__page__header">
                            <div className="taskbot-edit-page__page__header__title">
                                {t('taskbot:tab-dependencies-references-title')}
                            </div>
                            <IconButton
                                name="editor"
                                iconName="arrow-left"
                                onClick={this.handleEditorShow}
                            >
                                {t('taskbot:tab-editor-return-label')}
                            </IconButton>
                        </div>
                        <div className="taskbot-edit-page__page__content g-scroller" data-scroller="true">
                            <Tabs
                                activeId={activeTabId}
                                onActive={(id) => this.setState({fileDependencyActiveTabId: id})}
                                tabs={[
                                    {
                                        id: 'dependencies',
                                        label: t('repository:label-dependencies'),
                                        renderContent: () => {
                                            if (getAutomationTypeHasManualDependencies(automationType) && mode === 'edit') {
                                                return (
                                                    <div key="manual-dependencies">
                                                        <Help>
                                                            {t('repository:dependency-edit-help')}
                                                        </Help>
                                                        <Field
                                                            mode="edit"
                                                            name="dependencies"
                                                            component={BotTableField}
                                                            fields={dependencyFields}
                                                            workspaceName={workspaceName}
                                                            automationId={fileId}
                                                            folderId={automationFile?.parentId}
                                                            actionName="pagesTaskbotDependencies"
                                                            disabledDependencies={this.selectDisabledDependencies(this.props)}
                                                            disabled={Boolean(loadPending || updatePending || isGettingFileInterfaces)}
                                                        />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <FileChildTree
                                                    key="dependencies"
                                                    fileId={fileId}
                                                    fileVersion={automationFile?.versionNumber}
                                                    workspaceName={workspaceName}
                                                />
                                            );
                                        },
                                    },
                                    {
                                        id: 'references',
                                        label: t('repository:label-references'),
                                        renderContent: () => {
                                            return (
                                                <FileParentTable
                                                    key="references"
                                                    fileId={fileId}
                                                    fileLabel={automationFile?.botVersionLabel}
                                                    fileVersion={automationFile?.versionNumber}
                                                    workspaceName={workspaceName}
                                                />
                                            );
                                        },
                                    },
                                ]}
                            />
                            {Boolean(automationFile && mode === 'view') && (
                                <CommonDetailsPane
                                    className="taskbot-edit-page__details"
                                    label={t('repository:file-details')}
                                    type={this.getAutomationTypeLabel(automationFile.type)}
                                    object={automationFile}
                                    t={t}
                                />
                            )}
                        </div>
                    </div>
                );
            }
            case 'codeAnalysis': {
                const {filePolicy} = this.props;
                return (
                    <div key={key} className="taskbot-edit-page__page">
                        <div className="taskbot-edit-page__page__header">
                            <div className="taskbot-edit-page__page__header__title">
                                {t('taskbot:tab-code-analysis-title')}
                            </div>
                            <IconButton
                                name="editor"
                                iconName="arrow-left"
                                onClick={this.handleEditorShow}
                            >
                                {t('taskbot:tab-editor-return-label')}
                            </IconButton>
                        </div>
                        <div className="taskbot-edit-page__page__content g-scroller" data-scroller="true">
                            <CodeAnalysisEditPage
                                automationPolicy={filePolicy}
                                automationType={automationType === FILE_TYPE_HEADLESSBOT ? 'apitask' : 'taskbot'}
                                labelRulesDescription={t('codeanalysis:bot-editor-rules-help')}
                                isSubpage
                            />
                            {Boolean(automationFile && mode === 'view') && (
                                <CommonDetailsPane
                                    className="taskbot-edit-page__details"
                                    label={t('repository:file-details')}
                                    type={this.getAutomationTypeLabel(automationFile.type)}
                                    object={automationFile}
                                    t={t}
                                />
                            )}
                        </div>
                    </div>
                );
            }
            case 'packages': {
                if (getAutomationTypeIsProcess(automationType)) {
                    const processCodeVersion = getFieldValue('properties.processCodeVersion') || '0';
                    if (Number(processCodeVersion) <= 1) {
                        return (
                            <div key={key} className="taskbot-edit-page__page">
                                <div className="taskbot-edit-page__page__header">
                                    <div className="taskbot-edit-page__page__header__title">
                                        {t('taskbot:tab-packages-title')}
                                    </div>
                                    <IconButton
                                        name="editor"
                                        iconName="arrow-left"
                                        onClick={this.handleEditorShow}
                                    >
                                        {t('taskbot:tab-editor-return-label')}
                                    </IconButton>
                                </div>
                                <div className="taskbot-edit-page__page__content g-scroller" data-scroller="true">
                                    <Message
                                        theme="info"
                                        title={t('taskbot:packages-process-manager-legacy-title')}
                                    >
                                        {t('taskbot:packages-process-manager-legacy-body')}
                                    </Message>
                                </div>
                            </div>
                        );
                    }
                }
                if (!packages || !packages.length) {
                    if (loadPending) {
                        return null;
                    }
                    return (
                        <div key={key} className="taskbot-edit-page__page">
                            <div className="taskbot-edit-page__page__header">
                                <div className="taskbot-edit-page__page__header__title">
                                    {t('taskbot:tab-packages-title')}
                                </div>
                                <IconButton
                                    name="editor"
                                    iconName="arrow-left"
                                    onClick={this.handleEditorShow}
                                >
                                    {t('taskbot:tab-editor-return-label')}
                                </IconButton>
                            </div>
                            <div className="taskbot-edit-page__page__content g-scroller" data-scroller="true">
                                <Help>
                                    {t('packages:none-help')}
                                </Help>
                                {Boolean(automationFile && mode === 'view') && (
                                    <CommonDetailsPane
                                        className="taskbot-edit-page__details"
                                        label={t('repository:file-details')}
                                        type={this.getAutomationTypeLabel(automationFile.type)}
                                        object={automationFile}
                                        t={t}
                                    />
                                )}
                            </div>
                        </div>
                    );
                }
                const {usedPackageSet} = this.props;
                const seenPackageSet = new Set();
                const formPackages = getFieldValue('packages');
                const {used, available, restricted, disabled} = packages.reduce((result, pkg) => {
                    if (!seenPackageSet.has(pkg.name)) {
                        seenPackageSet.add(pkg.name);
                        if (usedPackageSet.has(pkg.name)) {
                            result.used.push(pkg);
                        }
                        else if (pkg.status === PACKAGE_STATUS_DISABLED) {
                            result.disabled.push(pkg);
                        }
                        else if (pkg.permissions?.botRestriction) {
                            result.restricted.push(pkg);
                        }
                        else {
                            result.available.push(pkg);
                        }
                    }
                    return result;
                }, {used: [], available: [], restricted: [], disabled: []});
                const missingPackageSet = new Set(usedPackageSet);
                used.forEach((pkg) => missingPackageSet.delete(pkg.name));
                const missing = [...missingPackageSet].map((name) => ({
                    name,
                    label: name,
                    packageVersion: formPackages?.find((pkg) => pkg.name === name)?.version,
                    isMissing: true,
                }));
                const renderPackage = (pkg) => {
                    const {packageVersions} = this.props;
                    const {packageVersionChoice} = this.state;
                    const currentVersion = packageVersionChoice[pkg.name];
                    let currentPackage;
                    if (currentVersion) {
                        const versions = packageVersions[pkg.name];
                        if (versions) {
                            currentPackage = versions.find((pkg) => currentVersion === pkg.packageVersion);
                        }
                    }
                    return (
                        <PackageResource
                            key={`${pkg.name}#${pkg.packageVersion}`}
                            type={PackageResource.TYPE_PACKAGE}
                            titleProperty="label"
                            label={currentVersion && pkg.packageVersion !== currentVersion
                                ? t('taskbot:package-status-unsaved')
                                : pkg.isMissing
                                    ? t('taskbot:package-status-missing')
                                    : pkg.status !== PACKAGE_STATUS_DEFAULT
                                        ? t('taskbot:package-status-not-default')
                                        : null}
                            item={currentPackage || pkg}
                            renderDetails={this.renderPackageDetails}
                            renderIcon={this.renderPackageIcon}
                            loading={packageVersionsPending[`get-taskbot-package-versions-${pkg.name}`]}
                            onOpen={this.handlePackageOpen}
                            t={t}
                        />
                    );
                };
                const renderPackages = (list) => {
                    return sortStable(list, (a, b) => {
                        const aLabel = a?.label?.trim();
                        const bLabel = b?.label?.trim();
                        if (!aLabel || !bLabel) {
                            return !aLabel && !bLabel ? 0 : !aLabel ? 1 : -1;
                        }
                        return aLabel.localeCompare(bLabel);
                    }).map(renderPackage);
                };
                return (
                    <div key={key} className="taskbot-edit-page__page">
                        <div className="taskbot-edit-page__page__header">
                            <div className="taskbot-edit-page__page__header__title">
                                {t('taskbot:tab-packages-title')}
                            </div>
                            <IconButton
                                name="editor"
                                iconName="arrow-left"
                                onClick={this.handleEditorShow}
                            >
                                {t('taskbot:tab-editor-return-label')}
                            </IconButton>
                        </div>
                        <div className="taskbot-edit-page__page__content taskbot-edit-page__page__content--details g-scroller" data-scroller="true">
                            {automationType === FILE_TYPE_TASKBOT && <BotStoreHelp/>}
                            {used.length > 0 && (
                                <>
                                    <RioHeader displayVariant="SECTION" label={t('taskbot:package-used-label')}/>
                                    {renderPackages(used)}
                                </>
                            )}
                            {missingPackageSet.size > 0 && (
                                <>
                                    <RioHeader displayVariant="SECTION" label={t('taskbot:package-missing-label')}/>
                                    {renderPackages(missing)}
                                </>
                            )}
                            {available.length > 0 && (
                                <>
                                    <RioHeader displayVariant="SECTION" label={t('taskbot:package-available-label')}/>
                                    {renderPackages(available)}
                                </>
                            )}
                            {restricted.length > 0 && (
                                <>
                                    <RioHeader displayVariant="SECTION" label={t('taskbot:package-restricted-label')}/>
                                    {renderPackages(restricted)}
                                </>
                            )}
                            {disabled.length > 0 && (
                                <>
                                    <RioHeader displayVariant="SECTION" label={t('taskbot:package-disabled-label')}/>
                                    {renderPackages(disabled)}
                                </>
                            )}
                            {Boolean(automationFile && mode === 'view') && (
                                <CommonDetailsPane
                                    className="taskbot-edit-page__details"
                                    label={t('repository:file-details')}
                                    type={this.getAutomationTypeLabel(automationFile.type)}
                                    object={automationFile}
                                    t={t}
                                />
                            )}
                        </div>
                    </div>
                );
            }
            case 'workItemTemplate': {
                const {workItemConfirm} = this.state;
                const workItemTemplateName = getFieldValue('workItemTemplateName');
                return (
                    <div key={key} className="taskbot-edit-page__page">
                        <div className="taskbot-edit-page__page__header">
                            <div className="taskbot-edit-page__page__header__title">
                                {t('taskbot:tab-workitem-template-title')}
                            </div>
                            <IconButton
                                name="editor"
                                iconName="arrow-left"
                                onClick={this.handleEditorShow}
                            >
                                {t('taskbot:tab-editor-return-label')}
                            </IconButton>
                        </div>
                        <div className="taskbot-edit-page__page__content g-scroller" data-scroller="true">
                            <Field
                                name="workItemTemplateName"
                                dataId="name"
                                component={WorkItemTemplatePickerField}
                                onChange={this.handleWorkItemTemplateChange}
                                actionName="pagesTaskbotWorkItemTemplateName"
                                disabled={Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                            />
                            {workItemTemplateName && !workItemConfirm && (
                                <WorkItemTemplateDetails
                                    workItemTemplateName={workItemTemplateName}
                                />
                            )}
                            {Boolean(automationFile && mode === 'view') && (
                                <CommonDetailsPane
                                    className="taskbot-edit-page__details"
                                    label={t('repository:file-details')}
                                    type={this.getAutomationTypeLabel(automationFile.type)}
                                    object={automationFile}
                                    t={t}
                                />
                            )}
                        </div>
                    </div>
                );
            }
            case 'advanced': {
                const renderTaskSettings = () => {
                    const {
                        packageDetails,
                        usedPackageSet,
                        featureFlags, licenseFlags,
                        variableNamePattern,
                        controlRoomVersion,
                        formSyncErrors,
                        formErrorKeys,
                        getFieldValue,
                        getFormValues,
                        onRunInChildWindowChange,
                        onRunInChildWindowModeChange,
                        touch, change,
                        hasFeatureRunInChildWindow,
                    } = this.props;
                    const sortPackages = (list) => sortStable(list, (a, b) => {
                        const aLabel = a?.label;
                        const bLabel = b?.label;
                        if (!aLabel || !bLabel) {
                            return !aLabel && !bLabel ? 0 : !aLabel ? 1 : -1;
                        }
                        return aLabel.localeCompare(bLabel);
                    });
                    const packageSettingsSections = sortPackages(Object.values(packageDetails.packageMap)).reduce((result, pkg) => {
                        const packageSettingsAttributes = getPackageSettingsAttributes(pkg.settingsAttributes, featureFlags, licenseFlags);
                        if (packageSettingsAttributes.length > 0) {
                            const isPackageUsed = usedPackageSet.has(pkg.name);
                            result.push(
                                <WithState
                                    defaultValue={false}
                                    renderContent={({state, setState}) => (
                                        <RioDetails
                                            key={pkg.name}
                                            id={`package-settings-${pkg.name}`}
                                            renderSummary={({isOpen}) => (
                                                <span className="taskbot-edit-page__details-title">
                                                    {!isOpen && formErrorKeys.some((key) => key.startsWith(`packageSettings.${pkg.name}`)) &&
                                                        <RioBadgeStatus sentiment="DANGER" size={16}/>}
                                                    <span>{pkg.label || pkg.name}</span>
                                                    {!isPackageUsed && <span>{t('label-parens-unused')}</span>}
                                                </span>
                                            )}
                                            renderDetails={() => {
                                                return (
                                                    <>
                                                        {!isPackageUsed && (
                                                            <Message
                                                                theme="warn"
                                                                title={t('taskbot:package-setting-warning-message-title')}
                                                            >
                                                                {t('taskbot:package-setting-warning-message-content', {packageName: pkg.label || pkg.name})}
                                                            </Message>
                                                        )}
                                                        {packageSettingsAttributes.map((attribute) => (
                                                            <TaskbotNodeDetailsAttribute
                                                                key={attribute.name}

                                                                {...packageDetails}

                                                                form="taskbot"
                                                                parentName={`packageSettings.${pkg.name}`}
                                                                mode={mode}
                                                                automationType={automationType}
                                                                automationIntendedPlatform={automationIntendedPlatform}
                                                                fileInterfaceMap={fileInterfaceMap}
                                                                nodeType={NODE_TYPE_TRIGGER}
                                                                attribute={attribute}
                                                                parentAttributes={packageSettingsAttributes}
                                                                onChange={(name, value) => {
                                                                    change(name, value);
                                                                    touch(name, value);
                                                                    this.dirty();
                                                                }}
                                                                onDirty={() => null}
                                                                getAttributeValues={() => null}
                                                                getFieldValue={getFieldValue}
                                                                getFormValues={getFormValues}
                                                                formErrorKeys={formErrorKeys}
                                                                formErrors={formSyncErrors}

                                                                workspaceName={workspaceName}
                                                                fileId={automationFile?.id}
                                                                onSubmit={this.handleSubmit}
                                                                controlRoomVersion={controlRoomVersion}
                                                                variableNamePattern={variableNamePattern}
                                                                fieldComponent={Field}
                                                                t={t}

                                                                touched
                                                            />
                                                        ))}
                                                    </>
                                                );
                                            }}
                                            isOpen={state}
                                            onIsOpenChange={setState}
                                        />
                                    )}
                                />,
                            );
                        }
                        return result;
                    }, []);
                    return (
                        <>
                            <RioHeader displayVariant="SECTION" label={t('taskbot:advanced-general-settings')}/>
                            <WithState
                                defaultValue
                                renderContent={({state, setState}) => (
                                    <RioDetails
                                        renderSummary={() => (
                                            <span className="taskbot-edit-page__details-title">
                                                {t('taskbot:advanced-bot-compatibility-label')}
                                            </span>
                                        )}
                                        renderDetails={() => {
                                            const {botCodeVersion} = getFieldValue('properties');
                                            const botCodeVersionFeatures = TASKBOT_CODE_VERSIONS.find((version) => version.botCodeVersion === botCodeVersion)?.getFeatures?.(t);
                                            return (
                                                <GridLayout form>
                                                    <GridLayout.Row>
                                                        <GridLayout.Column>
                                                            <Help>
                                                                {t('taskbot:advanced-bot-compatibility-description')}
                                                            </Help>
                                                            <Field
                                                                name="properties.botCodeVersion"
                                                                label={t('taskbot:advanced-bot-code-version-label')}
                                                                options={TASKBOT_CODE_VERSIONS.map(({botCodeVersion}) => ({
                                                                    label: botCodeVersion,
                                                                    value: botCodeVersion,
                                                                    description: botCodeVersion === TASKBOT_CODE_VERSION_DEFAULT
                                                                        ? t('taskbot:advanced-bot-code-version-default')
                                                                        : null,
                                                                }))}
                                                                optionFlowDirection="ROW"
                                                                onChange={() => this.dirty()}
                                                                component={RioSelectField}
                                                                isReadOnly={mode === 'view'}
                                                                isDisabled={mode === 'view' ? false : Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                                                                isSelectedDescriptionVisible
                                                                isMissingValueShown
                                                                searchMode="SEARCH_QUERY"
                                                            />
                                                            {botCodeVersionFeatures?.length > 0 && (
                                                                <Help>
                                                                    <ul>
                                                                        {botCodeVersionFeatures.map((token, index) => (
                                                                            <li key={index}>{t(token)}</li>
                                                                        ))}
                                                                    </ul>
                                                                </Help>
                                                            )}
                                                        </GridLayout.Column>
                                                        <GridLayout.Column>
                                                            <Field
                                                                name="properties.improvedNumberSupport"
                                                                label={t('taskbot:advanced-general-improved-number-label')}
                                                                options={[{value: true}, {value: false}]}
                                                                content={(
                                                                    <Help>
                                                                        {t('taskbot:advanced-general-improved-number-help')}
                                                                    </Help>
                                                                )}
                                                                component={CheckboxField}
                                                                readOnly={mode === 'view'}
                                                                disabled={mode === 'view' ? false : Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                                                            />
                                                        </GridLayout.Column>
                                                    </GridLayout.Row>
                                                </GridLayout>
                                            );
                                        }}
                                        isOpen={state}
                                        onIsOpenChange={setState}
                                    />
                                )}
                            />
                            <WithState
                                defaultValue={false}
                                renderContent={({state, setState}) => (
                                    <RioDetails
                                        renderSummary={() => (
                                            <span className="taskbot-edit-page__details-title">
                                                {t('taskbot:advanced-bot-timeout-label')}
                                            </span>
                                        )}
                                        renderDetails={() => (
                                            <GridLayout form>
                                                <GridLayout.Row>
                                                    <GridLayout.Column>
                                                        <Help>
                                                            {t('taskbot:advanced-bot-timeout-description')}
                                                        </Help>
                                                        <Field
                                                            min={0}
                                                            step={1}
                                                            max={9999}
                                                            type="number"
                                                            maxLength={4}
                                                            minLength={1}
                                                            component={TextField}
                                                            name="properties.timeout"
                                                            label={t('taskbot:advanced-timeout-label')}
                                                            help={t('taskbot:advanced-timeout-help', {maximum: 9999})}
                                                            normalize={(currentValue, previousValue) => {
                                                                return currentValue?.split(REGEX_SPECIAL_CHARACTERS).join('') ?? (previousValue || '0');
                                                            }}
                                                            readOnly={mode === 'view'}
                                                            disabled={mode === 'view' ? false : Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                                                        >
                                                            {t('taskbot:advanced-timeout-units')}
                                                        </Field>
                                                    </GridLayout.Column>
                                                </GridLayout.Row>
                                            </GridLayout>
                                        )}
                                        isOpen={state}
                                        onIsOpenChange={setState}
                                    />
                                )}
                            />
                            {(
                                canRunNow &&
                                automationType === FILE_TYPE_TASKBOT &&
                                hasFeatureRunInChildWindow &&
                                automationIntendedPlatform !== PLATFORM_TYPE_MACOS
                            ) && (
                                <WithState
                                    defaultValue={false}
                                    renderContent={({state, setState}) => (
                                        <RioDetails
                                            id="pip-mode-settings"
                                            renderSummary={() => (
                                                <span className="taskbot-edit-page__details-title">
                                                    {t('taskbot:advanced-pip-mode-title')}
                                                </span>
                                            )}
                                            renderDetails={() => (
                                                <GridLayout form>
                                                    <GridLayout.Row>
                                                        <GridLayout.Column>
                                                            <Help>
                                                                {t('taskbot:advanced-pip-mode-help')}
                                                            </Help>
                                                            <Field
                                                                name="properties.runInChildWindow"
                                                                label={t('taskbot:advanced-pip-mode-label')}
                                                                options={[{value: true}, {value: false}]}
                                                                component={CheckboxField}
                                                                readOnly={mode === 'view'}
                                                                disabled={mode === 'view' ? false : Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                                                                onChange={onRunInChildWindowChange}
                                                                content={(
                                                                    <Field
                                                                        name="properties.runInChildWindowMode"
                                                                        component={RadioField}
                                                                        disabled={mode === 'view' ? false : Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                                                                        options={[
                                                                            {
                                                                                value: TASKBOT_RUNTIME_VIRTUAL_MODE_DESKTOP,
                                                                                label: t('taskbot:advanced-pip-mode-option-desktop-label'),
                                                                                content: <Help>{t('taskbot:advanced-pip-mode-option-desktop-help')}</Help>,
                                                                            },
                                                                            {
                                                                                value: TASKBOT_RUNTIME_VIRTUAL_MODE_WINDOW,
                                                                                label: t('taskbot:advanced-pip-mode-option-window-label'),
                                                                                content: <Help>{t('taskbot:advanced-pip-mode-option-window-help')}</Help>,
                                                                            },
                                                                        ]}
                                                                        onChange={onRunInChildWindowModeChange}
                                                                        readOnly={mode === 'view'}
                                                                    />
                                                                )}
                                                            />
                                                        </GridLayout.Column>
                                                    </GridLayout.Row>
                                                </GridLayout>
                                            )}
                                            isOpen={state}
                                            onIsOpenChange={setState}
                                        />
                                    )}
                                />
                            )}
                            {canAccessAutomationPriority && getAutomationTypeActivityPriority(automationType) && (
                                <WithState
                                    defaultValue={false}
                                    renderContent={({state, setState}) => (
                                        <RioDetails
                                            renderSummary={() => (
                                                <span className="taskbot-edit-page__details-title">
                                                    {t('taskbot:advanced-priority-label')}
                                                </span>
                                            )}
                                            renderDetails={() => (
                                                <GridLayout form>
                                                    <GridLayout.Row>
                                                        <GridLayout.Column>
                                                            <Help>
                                                                {t('taskbot:advanced-priority-description')}
                                                            </Help>
                                                            <Field
                                                                name="properties.automationPriority"
                                                                help={t('taskbot:advanced-priority-help')}
                                                                options={[
                                                                    {
                                                                        label: t('taskbot:advanced-priority-option-low'),
                                                                        value: ACTIVITY_PRIORITY_LOW,
                                                                    },
                                                                    {
                                                                        label: t('taskbot:advanced-priority-option-medium'),
                                                                        value: ACTIVITY_PRIORITY_MEDIUM,
                                                                    },
                                                                    {
                                                                        label: t('taskbot:advanced-priority-option-high'),
                                                                        value: ACTIVITY_PRIORITY_HIGH,
                                                                    },
                                                                ]}
                                                                component={RioSelectField}
                                                                isReadOnly={mode === 'view'}
                                                                isDisabled={mode === 'view' ? false : Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                                                                searchMode="SEARCH_QUERY"
                                                            />
                                                        </GridLayout.Column>
                                                    </GridLayout.Row>
                                                </GridLayout>
                                            )}
                                            isOpen={state}
                                            onIsOpenChange={setState}
                                        />
                                    )}
                                />
                            )}
                            {packageSettingsSections.length > 0 && (
                                <>
                                    <RioHeader displayVariant="SECTION" label={t('taskbot:advanced-package-settings')}/>
                                    {packageSettingsSections}
                                </>
                            )}
                        </>
                    );
                };

                const renderProcessSettings = () => {
                    return (
                        <WithState
                            defaultValue
                            renderContent={({state, setState}) => (
                                <>
                                    <RioHeader displayVariant="SECTION" label={t('taskbot:advanced-general-settings')}/>
                                    <RioDetails
                                        renderSummary={() => (
                                            <span className="taskbot-edit-page__details-title">
                                                {t('taskbot:advanced-process-compatibility-label')}
                                            </span>
                                        )}
                                        renderDetails={() => {
                                            const {
                                                hasFeatureProcessEditorV1FallbackSave,
                                                hasFeatureProcessEditorPackageManager,
                                            } = this.props;
                                            const {processCodeVersion} = getFieldValue('properties');
                                            const processCodeVersionFeatures = PROCESS_CODE_VERSIONS.find((version) => version.processCodeVersion === processCodeVersion)?.getFeatures?.(t);
                                            const options = PROCESS_CODE_VERSIONS
                                                .map(({label, processCodeVersion}) => ({
                                                    label: label ? t(label) : processCodeVersion,
                                                    value: processCodeVersion,
                                                    isHidden: processCodeVersion === '0'
                                                        ? !hasFeatureProcessEditorV1FallbackSave
                                                        : processCodeVersion === '2'
                                                            ? !hasFeatureProcessEditorPackageManager
                                                            : false,
                                                }));
                                            return (
                                                <>
                                                    <Help>
                                                        {t('taskbot:advanced-process-compatibility-description')}
                                                    </Help>
                                                    <FieldLabel>
                                                        <RioSelectInput
                                                            name="properties.processCodeVersion"
                                                            label={t('taskbot:advanced-process-code-version-label')}
                                                            value={processCodeVersion}
                                                            options={options}
                                                            isReadOnly={mode === 'view'}
                                                            isDisabled={mode === 'view' ? false : Boolean(loadPending || updatePending || isGettingFileInterfaces || mode !== 'edit')}
                                                            isSelectedDescriptionVisible
                                                            isMissingValueShown
                                                            onChange={this.handleProcessCodeVersionChange}
                                                        />
                                                    </FieldLabel>
                                                    {processCodeVersionFeatures?.length > 0 && (
                                                        <Help hasMarginBlockEnd={false}>
                                                            <ul>
                                                                {processCodeVersionFeatures.map((token, index) => (
                                                                    <li key={index}>{t(token)}</li>
                                                                ))}
                                                            </ul>
                                                        </Help>
                                                    )}
                                                </>
                                            );
                                        }}
                                        isOpen={state}
                                        onIsOpenChange={setState}
                                    />
                                </>
                            )}
                        />
                    );
                };

                return (
                    <div key={key} className="taskbot-edit-page__page">
                        <div className="taskbot-edit-page__page__header">
                            <div className="taskbot-edit-page__page__header__title">
                                {t('taskbot:tab-advanced-title')}
                            </div>
                            <IconButton
                                name="editor"
                                iconName="arrow-left"
                                onClick={this.handleEditorShow}
                            >
                                {t('taskbot:tab-editor-return-label')}
                            </IconButton>
                        </div>
                        <div className="taskbot-edit-page__page__content taskbot-edit-page__page__content--details g-scroller" data-scroller="true">
                            {getAutomationTypeIsTask(automationType)
                                ? renderTaskSettings()
                                : getAutomationTypeIsProcess(automationType)
                                    ? renderProcessSettings()
                                    : null}
                            {Boolean(automationFile) && mode === 'view' && (
                                <CommonDetailsPane
                                    className="taskbot-edit-page__details"
                                    label={t('repository:file-details')}
                                    type={this.getAutomationTypeLabel(automationFile.type)}
                                    object={automationFile}
                                    t={t}
                                />
                            )}
                        </div>
                    </div>
                );
            }
            default:
                return tabId;
        }
    }

    renderFileEdit() {
        const {fileEditShow} = this.state;
        if (!fileEditShow) {
            return;
        }
        const {automationFile} = this.props;
        return (
            <RepositoryActionFileEdit
                file={automationFile}
                onSubmit={this.handleFileEditSubmit}
                onHide={this.handleFileEditCancel}
                show
            />
        );
    }

    renderFileSaveAsPrompt() {
        const {fileSaveAs} = this.state;
        if (!fileSaveAs) {
            return null;
        }
        const {automationFile} = this.props;
        return (
            <RepositoryActionFileSaveAs
                type={fileSaveAs}
                file={automationFile}
                onHide={this.handleSaveAsHide}
                onDone={this.handleSaveAsDone}
            />
        );
    }

    renderWorkItemTemplateQueuePrompt() {
        const {workItemTemplateQueueShow, workItemTemplateQueueValue} = this.state;
        if (!workItemTemplateQueueShow) {
            return null;
        }
        const {getFieldValue, t} = this.props;
        return (
            <ModalForm
                id="taskbot-run-with-queue"
                title={t('activities:run-bot-queue-title')}
                labelCancel={t('label-cancel')}
                labelSubmit={t('label-continue')}
                onHide={this.handleWorkItemTemplateQueueCancel}
                onSubmit={this.handleWorkItemTemplateQueueConfirm}
                submitDisabled={!workItemTemplateQueueValue}
                show
            >
                <ModalForm.Content>
                    <FieldLabel label={t('resource-queue-label')}>
                        <QueuePickerInput
                            placeholder={t('choose-queue-title')}
                            workItemTemplateName={getFieldValue('workItemTemplateName')}
                            value={workItemTemplateQueueValue}
                            onChange={(workItemTemplateQueueValue) => this.setState({workItemTemplateQueueValue})}
                            canAccessConsumers
                            isNotInUse
                        />
                    </FieldLabel>
                </ModalForm.Content>
            </ModalForm>
        );
    }

    renderWorkItemTemplateConfirm() {
        const {workItemConfirm, workItemWasUserDefined, workItemReferenced} = this.state;
        if (!workItemConfirm) {
            return null;
        }
        const {t} = this.props;
        let title, message;
        if (workItemWasUserDefined) {
            title = t('taskbot:label-workitem-template-userdefined-title');
            message = t('taskbot:label-workitem-template-userdefined-message');
        }
        if (workItemReferenced) {
            title = t('taskbot:label-workitem-template-reference-title');
            message = t('taskbot:label-workitem-template-reference-message');
        }
        return (
            <Confirm
                id="taskbot-edit-page__work-item-template-confirm"
                theme="info"
                title={title}
                labelAccept={t('label-ok')}
                labelCancel={t('label-cancel')}
                onHide={this.handleWorkItemTemplateCancel}
                onSubmit={this.handleWorkItemTemplateConfirm}
                show
            >
                {message}
            </Confirm>
        );
    }

    renderLoadingError() {
        const {loadError, packageError, automationFile, automationType, route: {mode}, t} = this.props;
        let error = loadError || packageError;
        if (!error) {
            if (!automationFile) {
                return null;
            }
            switch (automationType) {
                case FILE_TYPE_TASKBOT:
                case FILE_TYPE_TASKBOT_TEMPLATE:
                case FILE_TYPE_HEADLESSBOT:
                case FILE_TYPE_PROCESS:
                case FILE_TYPE_PROCESS_TEMPLATE:
                    if (mode === 'edit' && !automationFile?.permission?.editContent) {
                        error = {
                            title: t('repository:load-error-permission-edit-automation-title'),
                            body: t('repository:load-error-permission-edit-automation-body'),
                        };
                    }
                    break;
                default:
                    error = {
                        title: t('repository:load-error-format-title'),
                        body: t('repository:load-error-format-automation-body'),
                    };
            }
        }
        const parts = renderErrorParts(t, error);
        if (!parts) {
            return null;
        }
        const {title, body} = parts;
        return (
            <RioStatusDisplay
                variant="ERROR"
                title={title}
                controls={(
                    <>
                        <CommandButton
                            name="close"
                            onClick={this.handleClose}
                        >
                            {t('repository:action-load-error-back')}
                        </CommandButton>
                        {mode === 'edit' && !automationFile?.permission?.editContent && automationFile?.permission?.viewContent
                            ? (
                                <CommandButton
                                    name="view"
                                    onClick={this.handleView}
                                    recommended
                                >
                                    {t('repository:action-load-error-view-taskbot')}
                                </CommandButton>
                            )
                            : (
                                <CommandButton
                                    name="refresh"
                                    onClick={this.handleRefresh}
                                    recommended
                                >
                                    {t('repository:action-load-error-retry')}
                                </CommandButton>
                            )}
                    </>
                )}
            >
                {body}
            </RioStatusDisplay>
        );
    }

    renderAssistant() {
        const {
            automationFile,
            automationType,
            automationReport,
            packageDetails,
            fileCodeAnalysisReport,
            canDebug,
            variableNamePattern,
            debugger: dbugger, onDebuggerStep, onDebuggerStepIn, onDebuggerStepOut,
            onDebuggerFrameVariableValueChange, onDebuggerPlay, onDebuggerVariableValueChange,
            getFieldValue,
            route,
        } = this.props;
        const {
            cursor,
            collapsed,
            search, searchParameters,
            editorSettings,
            debugPointsMap,
            assistantShow, assistantPage,
            chatbot,
        } = this.state;
        if (!assistantShow || !automationFile) {
            return null;
        }
        const isPristine = this.selectIsPristine(this.props, this.state);
        const mode = this.selectMode(this.props);
        const triggers = getFieldValue('triggers') || EMPTY_ARRAY;
        const nodes = getFieldValue('nodes') || EMPTY_ARRAY;
        const orphans = getFieldValue('orphans') || EMPTY_ARRAY;
        const variables = getFieldValue('variables') || EMPTY_ARRAY;
        const referencedVariableSet = this.selectReferencedVariablesSet(this.props);
        let filePath = automationFile.path;
        if (dbugger) {
            if (dbugger?.callstackFrames?.length > 0 && dbugger?.currentCallstackFrameUuid) {
                const currentFrame = dbugger.callstackFrames.find((frame) => frame.frameUuid === dbugger.currentCallstackFrameUuid);
                filePath = getFileInfoFromFrame(currentFrame).filePath;
            }
        }
        const debuggerVariables = debugPointsMap.get(filePath)?.watchVariables;
        const hasEditorSettingCopilotForAutomators = editorSettings[EDITOR_SETTING_COPILOT_FOR_AUTOMATORS];
        return (
            <TaskbotAssistant
                parentRef={this.assistantEnclosureRef}
                buttonRef={this.assistantButtonRef}

                mode={route.mode}

                file={automationFile}

                triggers={triggers}
                nodes={nodes}
                orphans={orphans}
                variables={variables}

                triggerMap={packageDetails.triggerMap}
                commandMap={packageDetails.commandMap}
                variableMap={packageDetails.variableMap}
                packageMap={packageDetails.packageMap}

                collapsed={collapsed}
                variableNamePattern={variableNamePattern}

                page={assistantPage}
                onPageChange={this.handleAssistantPageChange}

                search={search}
                searchParameters={searchParameters}
                searchResults={this.selectSearchResults(this.props, this.state)}
                onSearchChange={this.handleSearchChange}
                onSearchParametersChange={this.handleSearchParametersChange}
                onSearchResultsReplace={this.handleSearchResultsReplace}

                cursor={cursor}
                onCursorChange={this.handleCursorChange}

                debugPointsMap={debugPointsMap}
                onDebugPointsMapChange={this.handleDebugPointsChange}

                hasDebugger={canDebug}
                debugger={mode === 'debug' ? dbugger : null}
                debuggerVariables={debuggerVariables}
                onDebuggerStart={this.handleDebuggerStart}
                onDebuggerStep={onDebuggerStep}
                onDebuggerStepIn={onDebuggerStepIn}
                onDebuggerStepOut={onDebuggerStepOut}
                onDebuggerFrameChange={this.handleDebuggerFrameChange}
                onDebuggerFrameVariablesReset={this.handleDebuggerFrameVariablesReset}
                onDebuggerFrameVariablesFetch={this.handleDebuggerFrameVariablesFetch}
                onDebuggerPlay={onDebuggerPlay}
                onDebuggerStop={this.handleDebuggerStop}
                onDebuggerVariableValueChange={onDebuggerVariableValueChange}
                onDebuggerFrameVariableValueChange={onDebuggerFrameVariableValueChange}

                chatbot={chatbot}
                onChatbotChange={this.handleChatbotChange}
                hasEditorSettingCopilotForAutomators={hasEditorSettingCopilotForAutomators}

                referencedVariableSet={referencedVariableSet}

                automationType={automationType}
                automationReport={automationReport}
                codeAnalysisReport={fileCodeAnalysisReport}

                onHide={this.handleAssistantHide}

                hasChanges={!isPristine}
                onCheckUnsaved={this.handleCheckUnsaved}

                onTabChange={this.handleTabChange}
                chatbotRecorderCurrentTabId={this.state.chatbotRecorderCurrentTabId}
                onChatbotRecorderCurrentTabIdChange={this.handleChatbotRecorderCurrentTabIdChange}
                getChatbotContentJson={this.getChatbotContentJson}
            />
        );
    }

    render() {
        const {
            automationFile, automationType,
            automationReport,
            botResiliencySettings,
            canDebug,
            canRunNow,
            canRunWithTriggers,
            canRunWithQueue,
            debugger: dbugger,
            fileCodeAnalysisReport,
            filePolicy,
            getFieldValue,
            hasFeatureAccessQueues,
            hasFeatureRunInChildWindow,
            hasFeatureUnexpectedPopups,
            handleUnexpectedPopups,
            handleUnexpectedPopupsChange,
            loadPending, updatePending,
            onRunElevatedChange,
            onRunInChildWindowChange,
            onRunInChildWindowModeChange,
            runElevated,
            runInChildWindow,
            runInChildWindowMode,
            route,
            t,
        } = this.props;
        const {
            assistantShow,
            assistantPage,
            editorSettings,
            tabId,
            error, errorBlocking,
            assistantStyle,
            isGettingFileInterfaces,
        } = this.state;
        const isPristine = this.selectIsPristine(this.props, this.state);
        const mode = this.selectMode(this.props);
        const hasTriggers = this.selectHasTriggers(this.props);
        const hasWorkItemTemplate = this.hasWorkItemTemplate(this.props);
        const loadingError = this.renderLoadingError();
        const hasEditorSettingCopilotForAutomators = editorSettings?.[EDITOR_SETTING_COPILOT_FOR_AUTOMATORS];
        const hasHandleUnexpectedPopups = Boolean(botResiliencySettings?.common?.handleUnexpectedPopups);
        return (
            <WithPrintable
                renderContent={({renderDisplay, renderPrint}) => (
                    <EditorPage
                        className={classnames('taskbot-edit-page', renderDisplay(() => 'taskbot-edit-page--display'), renderPrint(() => 'taskbot-edit-page--print'))}
                        borderColorVariant={mode === 'debug' && dbugger?.started ? null : 'EXTENDED_MARINE'}
                        onClick={this.handleEditorPageClick}
                        renderHeader={() => (
                            <TaskbotEditHeader
                                file={automationFile}
                                hasEdits={!isPristine}
                                hasLoadingError={Boolean(loadingError)}
                                hasFeatureAccessQueues={hasFeatureAccessQueues}
                                hasWorkItemTemplate={(mode === 'edit' || getFieldValue('workItemTemplateName'))}
                                filePolicyId={filePolicy?.id}
                                tabId={tabId}
                                handleSave={this.handleCheckUnsaved}
                                handleTabChange={this.handleTabChange}
                                onFileEdit={dbugger || loadPending || updatePending || isGettingFileInterfaces || loadingError
                                    ? null
                                    : this.handleFileEditShow}
                                showKeyboardBindings={this.handleKeyboardBindingToggle}
                                hasAssistantButtonIndicator={Boolean(automationReport.hasErrors || fileCodeAnalysisReport)}
                                canDebug={canDebug}
                                canRunNow={canRunNow}
                                hasRunWithTriggers={hasTriggers && canRunWithTriggers}
                                hasRunWithQueue={hasWorkItemTemplate && canRunWithQueue}
                                isRunElevatedValue={runElevated}
                                onRunElevatedChange={onRunElevatedChange}
                                hasFeatureRunInChildWindow={hasFeatureRunInChildWindow}
                                hasEditorSettingCopilotForAutomators={hasEditorSettingCopilotForAutomators}
                                isRunInChildWindowValue={runInChildWindow}
                                onRunInChildWindowChange={onRunInChildWindowChange}
                                runInChildWindowMode={runInChildWindowMode}
                                onRunInChildWindowModeChange={onRunInChildWindowModeChange}
                                isAssistantVisible={assistantShow}
                                assistantPage={assistantPage}
                                hasFeatureUnexpectedPopups={hasFeatureUnexpectedPopups}
                                hasHandleUnexpectedPopups={hasHandleUnexpectedPopups}
                                isUnexpectedPopupsValue={handleUnexpectedPopups}
                                handleUnexpectedPopupsChange={handleUnexpectedPopupsChange}
                                handleRunStart={this.handleRunStart}
                                handleRunTriggersStart={this.handleRunTriggersStart}
                                handleRunQueueStart={this.handleRunQueueStart}
                                handleAssistantToggle={this.handleAssistantToggle}
                                handleAssistantPageOpen={this.handleAssistantPageOpen}
                                isDebuggerActive={dbugger}
                                pageVariant={mode === 'edit' ? 'EDIT' : 'VIEW'}
                                pendingVariant={loadPending
                                    ? 'LOADING'
                                    : isGettingFileInterfaces || updatePending
                                        ? 'WORKING'
                                        : null}
                            />
                        )}
                        onSizeChange={this.handleSizeChange}
                        loading={Boolean(loadPending)}
                        working={Boolean(updatePending || isGettingFileInterfaces)}
                        workingError={error}
                        workingBlocking={errorBlocking}
                        renderWorkingError={({workingError, onClose}) => renderErrorAlert(t, workingError, onClose)}
                        hasChanges={!isPristine && route.mode === 'edit'}
                        renderContent={() => {
                            let pageHelmetTitle = null;
                            let favicon = null;
                            switch (automationType) {
                                case FILE_TYPE_TASKBOT:
                                    pageHelmetTitle = route.mode === 'view' ? t('route-repository-taskbot-view') : t('route-repository-taskbot-edit');
                                    favicon = faviconTaskbot;
                                    break;
                                case FILE_TYPE_TASKBOT_TEMPLATE:
                                    pageHelmetTitle = route.mode === 'view' ? t('route-repository-taskbot-template-view') : t('route-repository-taskbot-template-edit');
                                    favicon = faviconTaskbotTemplate;
                                    break;
                                case FILE_TYPE_HEADLESSBOT:
                                    pageHelmetTitle = route.mode === 'view' ? t('route-repository-headlessbot-view') : t('route-repository-headlessbot-edit');
                                    favicon = faviconHeadlessbot;
                                    break;
                                case FILE_TYPE_PROCESS:
                                    pageHelmetTitle = route.mode === 'view' ? t('route-repository-process-view') : t('route-repository-process-edit');
                                    favicon = faviconProcess;
                                    break;
                                case FILE_TYPE_PROCESS_TEMPLATE:
                                    pageHelmetTitle = route.mode === 'view' ? t('route-repository-process-template-view') : t('route-repository-process-template-edit');
                                    favicon = faviconProcessTemplate;
                                    break;
                                case FILE_TYPE_AI_AGENT_TEMPLATE:
                                    pageHelmetTitle = route.mode === 'view' ? t('route-repository-ai-agent-template-view') : t('route-repository-ai-agent-template-edit');
                                    favicon = faviconProcessTemplate;
                                    break;
                                default:
                                    pageHelmetTitle = route.mode === 'view' ? t('route-repository-automation-view') : t('route-repository-automation-edit');
                            }
                            return (
                                <>
                                    <PageHelmet title={pageHelmetTitle} resource={automationFile?.name}>
                                        <link key={favicon} id="favicon" rel="icon" type="image/svg+xml" href={favicon}/>
                                    </PageHelmet>

                                    {route.mode === 'edit' && (
                                        <FormWarden enabled={!isPristine}/>
                                    )}

                                    {this.renderPackageUpdate()}

                                    {this.renderCopyMetadata()}

                                    {this.renderGlobalClipboardMessage()}

                                    {this.renderFileEdit()}

                                    {this.renderFileSaveAsPrompt()}

                                    {this.renderInputVariableConfirm()}

                                    {this.renderWorkItemTemplateQueuePrompt()}

                                    {this.renderWorkItemTemplateConfirm()}

                                    {this.renderMessage()}

                                    {this.renderKeyBindingModal()}

                                    {renderDisplay(() => (
                                        <AssistantEnclosure
                                            ref={this.assistantEnclosureRef}
                                            assistantStyle={assistantStyle}
                                            onAssistantStyleChange={this.handleAssistantStyle}
                                            assistant={this.renderAssistant()}
                                        >
                                            {loadingError || this.renderContent()}
                                        </AssistantEnclosure>
                                    ))}
                                    {renderPrint(() => this.renderContent())}
                                </>
                            );
                        }}
                    />
                )}
            />
        );
    }
}

export default TaskbotEditPage;
