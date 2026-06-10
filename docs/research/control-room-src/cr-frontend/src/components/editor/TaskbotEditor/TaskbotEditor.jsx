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
import isEqual from 'lodash/isEqual';
import uniq from 'lodash/uniq';
import {
    EditorLayout, EditorPalette, EditorDetails, ActionBar, Sized, EditorTabs, Message,
    CheapSet, fromLocalStorage, addEventListener, removeEventListener,
    getEventKey, CommandButton, IconButton, RioLink, Dropdown, RioBadgeStatus, RioSpinner,
    getEventHasExactModifierKeys,
    RioPill,
    RioIcon,
    Prompt,
    RadioGroup,
    RadioInput,
    Help,
    generateUUID,
    getRepositoryUri,
} from '@automationanywhere/rio-components';
import {
    PACKAGE_ATTRIBUTE_TYPE_TASKBOT,
    PACKAGE_ATTRIBUTE_TYPE_AUTOMATION,

    VALUE_TYPE_WINDOW,
    VALUE_TYPE_UIOBJECT,
    VALUE_TYPE_IMAGE,
    VALUE_TYPE_DICTIONARY,
    VALUE_TYPE_TASKBOT,
    VALUE_TYPE_AUTOMATION,
    VALUE_TYPE_FILE,
    WINDOW_PRESET_NONE,
} from '@automationanywhere/rio-components/editor';

import {ErrorBoundary} from '../../common/ErrorBoundary';
import {WithPrintable} from '../../common/WithPrintable';
import {EditorContextProvider} from '../EditorContext';
import {TaskbotItemPalette} from '../TaskbotItemPalette';
import {TaskbotVariableManager} from '../TaskbotVariableManager';
import {TaskbotNodeDetails} from '../TaskbotNodeDetails';
import {TaskbotVariableDetails} from '../TaskbotVariableDetails';
import {TaskbotEditorFinder} from '../TaskbotEditorFinder';
import {TaskbotEditorSearch} from '../TaskbotEditorSearch';
import {TaskbotCanvasList} from '../TaskbotCanvasList';
import {TaskbotCanvasFlow} from '../TaskbotCanvasFlow';
import {TaskbotCanvasProcess} from '../TaskbotCanvasProcess';
import {getFileInterfaceByType} from '../TaskbotAutomationField/utils';
import {TaskbotNodeTitle} from '../TaskbotNodeTitle';
import {platformToString} from '../../resources/repositories/FilePlatform';
import {getDefaultAttributes} from '../../../store/forms/taskbotNodeValues';
import {getTaskbotRedoLabel, getTaskbotUndoLabel} from '../../../store/selectors/taskbotChanges';
import {PACKAGE_NAME_RECORDER} from '../../../store/constants/packages';
import {BOTSTORE_A2019_URL} from '../../../store/constants/botstore';
import {
    getAutomationTypeHasCanvasList,
    getAutomationTypeHasCanvasFlow,
    getAutomationTypeHasCanvasProcess,
    getAutomationTypeHasPackages,
    getAutomationTypeIsProcess,
    getAutomationTypeHasDisable,
    getAutomationTypeHasParentAutoSelect,
    getAutomationTypeIsTask,
} from '../../../store/selectors/taskbotFeatures';
import {FILE_TYPE_TASKBOT, WORKSPACE_PRIVATE} from '../../../store/constants/repositories';
import {getFileInterface} from '../../../store/actions/repositories';
import {dispatch} from '../../../store';
import {renderErrorAlert} from '../../../util/error';
import {
    NODE_TYPE_COMMAND,
    NODE_TYPE_TRIGGER,
    KEY_PALETTE,
    KEY_PALETTE_ACTIONS,
    KEY_PALETTE_VARIABLES,
    KEY_PALETTE_TRIGGERS,
    KEY_CANVAS,
    KEY_CANVAS_FLOW,
    KEY_CANVAS_LIST,
    KEY_DETAILS,
    SIZE_DETAILS_DEFAULT,
    DRAGGING_INVALID,
    DRAGGING_END,
    POSITION_BEFORE,
    POSITION_CHILDREN,
    POSITION_BRANCH,
    POSITION_END,
    POSITION_NONE,
    getNode,
    getNodeContext,
    replaceNodes,
    getNodeWithDisabled,
    replaceNodesDeep,
    forNodes,
    getNodesRange,
    getNodeParents,
    getNextOrphans,
    getNextNodesAndOrphansWithoutEdges,
    forNodesWithMetadata,
    getPackageCommandKey,
    getPackageTriggerKey,
    getNextNodesWithUnlinkedSplitMerge,
} from '../utils/nodes';
import {canTaskAddNode, canTaskMoveNode, canTaskMoveNodes, getCanProcessInsertNodes} from '../utils/nodeAppend';
import {getIsVariableInputAllowed} from '../utils/processRoot';
import {getHasHelp, handleHelpClick} from '../utils/help';
import {CREATE_SELECTOR_EFFECT_OPTIONS} from '../../../util/reselect';
import {getKeyBinding} from '../../../util/keyBinding';

import './TaskbotEditor.css';

const DELAY_DRAG = 300;
const DELAY_OPEN = 500;
const DELAY_UPDATE = 50;

const selectDraggingResults = createSelector(
    (source) => source,
    (source, nodes) => nodes,
    (source, nodes, objectMap) => objectMap,
    () => Object.create(null),
);

const canAddNodeResult = (nodes, object, node, position, objectMap, objectNameKey, draggingOver) => {
    const results = selectDraggingResults(object.key, nodes, objectMap);
    const key = `node:${node ? node.uid : 'null'}&position=${position}&over=${draggingOver}`;
    let result = results[key];
    if (result === undefined) {
        result = canTaskAddNode(nodes, object, node, position, objectMap, objectNameKey, draggingOver);
        results[key] = result;
    }
    return result;
};

const canMoveNodeResult = (nodes, draggingUid, node, position, objectMap, objectNameKey, draggingOver) => {
    const results = selectDraggingResults(draggingUid, nodes, objectMap);
    const key = `node=${node ? node.uid : 'null'}&position=${position}&over=${draggingOver}`;
    let result = results[key];
    if (result === undefined) {
        result = canTaskMoveNode(nodes, draggingUid, node, position, objectMap, objectNameKey, draggingOver);
        results[key] = result;
    }
    return result;
};

const canMoveNodesResult = (nodes, draggingUids, node, position, objectMap, objectNameKey) => {
    const results = selectDraggingResults(draggingUids.join(','), nodes, objectMap);
    const key = `node=${node ? node.uid : 'null'}&position=${position}`;
    let result = results[key];
    if (result === undefined) {
        result = canTaskMoveNodes(nodes, draggingUids, node, position, objectMap, objectNameKey);
        results[key] = result;
    }
    return result;
};

const cloneNode = (node, parents, objectMap, nodeType) => {
    if (!node) {
        return null;
    }

    const objectNameKey = nodeType === NODE_TYPE_TRIGGER ? 'triggerName' : 'commandName';
    const object = objectMap[`${node.packageName}#${node[objectNameKey]}`.toLowerCase()];
    if (!object) {
        return null;
    }

    if (object.ancestorOf && parents.length > 0) {
        if (!parents.some((parent) =>
            parent.packageName === object.packageName &&
            parent[objectNameKey] === object.ancestorOf)
        ) {
            return null;
        }
    }

    const nextNode = {
        ...node,
        uid: generateUUID(),
    };
    if (nextNode.children) {
        const nextParents = [...parents, nextNode];
        nextNode.children = nextNode.children
            .map((node) => cloneNode(node, nextParents, objectMap, nodeType))
            .filter(Boolean);
    }
    if (nextNode.branches) {
        nextNode.branches = nextNode.branches
            .map((node) => cloneNode(node, parents, objectMap, nodeType))
            .filter(Boolean);
    }
    return nextNode;
};

const getNodeTypeProps = (props, nodeType) => nodeType !== NODE_TYPE_TRIGGER
    ? {
        ...props,
        commandNameKey: 'commandName',
        commandKey: 'commandKey',
        onGenericNodesChange: !props.onNodesChange
            ? null
            : (nodes, options = {}) => props.onNodesChange({nodes, ...options}),
    }
    : {
        ...props,
        commandMap: props.triggerMap,
        commandGroups: props.triggerGroups,
        commandNameKey: 'triggerName',
        commandKey: 'triggerKey',
        nodes: props.triggers,
        onGenericNodesChange: !props.onNodesChange
            ? null
            : (triggers, options = {}) => props.onNodesChange({triggers, ...options}),
    };

const forOrphans = (orphans, forNodes) => orphans.forEach((entry) => {
    if (entry?.nodes) {
        forNodes(entry.nodes);
    }
});

const getCursorEdges = (cursor) => {
    if (!cursor) {
        return [];
    }
    const set = new Set(cursor.uids);
    if (cursor.uid) {
        set.add(cursor.uid);
    }
    if (!set.size) {
        return [];
    }
    return [...set].reduce((result, uid) => {
        if (uid.startsWith('e')) {
            const [source, target] = uid.slice(1).split('_', 2);
            if (source && target) {
                result.push({source, target});
            }
        }
        return result;
    }, []);
};

const createNode = (object, commandNameKey, commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap) => {
    const node = {
        uid: generateUUID(),
        [commandNameKey]: object.name,
        packageName: object.packageName,
        attributes: getDefaultAttributes(object.attributes, iteratorMap, conditionalMap, triggerMap, exceptionMap),
    };
    if (object.anchorDefaultValue) {
        node.anchor = object.anchorDefaultValue;
    }
    if (object.returnDefaultValue?.type) {
        node.returnTo = object.returnDefaultValue;
    }
    if (object.nestable) {
        node.children = [];
        if (object.defaultChildren?.length > 0) {
            object.defaultChildren.forEach((defaultChildObject) => {
                const defaultObject = commandMap[`${defaultChildObject.packageName || object.packageName}#${defaultChildObject.name}`.toLowerCase()];
                if (defaultObject) {
                    node.children.push(createNode(defaultObject, commandNameKey, commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap));
                }
            });
        }
        else if (object.defaultChild) {
            const defaultObject = commandMap[`${object.defaultChildPackageName || object.packageName}#${object.defaultChild}`.toLowerCase()];
            if (defaultObject) {
                node.children.push(createNode(defaultObject, commandNameKey, commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap));
            }
        }
    }
    if (object.branchable) {
        node.branches = [];
        if (object.defaultBranches?.length > 0) {
            object.defaultBranches.forEach((defaultBranchObject) => {
                const defaultObject = commandMap[`${defaultBranchObject.packageName || object.packageName}#${defaultBranchObject.name}`.toLowerCase()];
                if (defaultObject) {
                    const branchObject = Object.entries(defaultBranchObject).reduce((result, [key, value]) => {
                        if (value) {
                            result[key] = value;
                        }
                        return result;
                    }, {...defaultObject});
                    node.branches.push(createNode(branchObject, commandNameKey, commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap));
                }
            });
        }
        else if (object.defaultBranch) {
            const defaultObject = commandMap[`${object.defaultBranchPackageName || object.packageName}#${object.defaultBranch}`.toLowerCase()];
            if (defaultObject) {
                node.branches.push(createNode(defaultObject, commandNameKey, commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap));
            }
        }
    }
    return node;
};

const getNodeSwimlaneUid = (nodes, orphans, test) => {
    let targetNode = null;
    targetNode = getNode(nodes, test);
    if (!targetNode) {
        orphans.some(({nodes}) => {
            targetNode = getNode(nodes, test);
            return targetNode;
        });
    }
    return targetNode?.layout?.swimlaneUid || null;
};

const getLastNodeUid = (nodes) => {
    if (!nodes?.length > 0) {
        return;
    }

    const lastNode = nodes.at(-1);
    if (lastNode.branches?.length > 0) {
        return getLastNodeUid(lastNode.branches);
    }
    if (lastNode.children?.length > 0) {
        return getLastNodeUid(lastNode.children);
    }
    return lastNode.uid;
};

class TaskbotEditor extends Component {
    static displayName = 'TaskbotEditor';

    constructor(props) {
        super(props);

        this.editorRef = createRef();
        this.paletteRef = createRef();
        this.toolbarRef = createRef();
        this.leftCanvasRef = createRef();
        this.rightCanvasRef = createRef();
        this.detailsRef = createRef();

        this.dragSourceRef = createRef();

        this.searchRef = createRef();
        this.searchInputRef = createRef();

        this.timeoutCursorOpen = null;
        this.selectCursorChange = createSelector(
            (props) => props.cursor?.uid,
            (props) => props.cursor?.uids ? [...(props.cursor?.uids || [])].join(',') : null,
            (cursorUid) => {
                const {nodes, collapsed, onCollapsedChange} = this.props;
                if (cursorUid && onCollapsedChange) {
                    if (nodes?.length > 0) {
                        const nodeParents = getNodeParents(nodes, cursorUid, {includeBranches: true})?.slice(0, -1);
                        if (nodeParents?.length > 0) {
                            const nextCollapsed = new CheapSet(collapsed);
                            nodeParents.forEach((node) => {
                                collapsed.remove(`node:${node?.uid}`);
                            });
                            if (!nextCollapsed.isEqual(collapsed)) {
                                onCollapsedChange(nextCollapsed.clone());
                            }
                        }
                    }
                }

                if (!this.state.details || !cursorUid) {
                    clearTimeout(this.timeoutCursorOpen);
                    this.handleCursorOpen();
                    return;
                }
                this.setState({detailsDebounced: true}, () => {
                    clearTimeout(this.timeoutCursorOpen);
                    this.timeoutCursorOpen = setTimeout(() => {
                        this.timeoutCursorOpen = null;
                        this.handleCursorOpen();
                    }, DELAY_OPEN);
                });
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectCursorObject = createSelector(
            (props) => props.triggers,
            (props) => props.triggerMap,
            (props) => props.nodes,
            (props) => props.commandMap,
            (props) => props.cursor,
            (triggers, triggerMap, nodes, commandMap, cursor) => {
                if (!cursor || cursor.uids) {
                    return;
                }

                const trigger = getNode(triggers, (trigger) => trigger.uid === cursor.uid);
                if (trigger) {
                    return triggerMap[getPackageTriggerKey(trigger)];
                }

                const node = getNode(nodes, (node) => node.uid === cursor.uid);
                if (node) {
                    return commandMap[getPackageCommandKey(node)];
                }
            },
        );

        this.selectActiveCanvas = createSelector(
            (props) => props.cursor,
            (props) => getAutomationTypeIsProcess(props.automationType) || (props.collapsed && !props.collapsed.has(KEY_CANVAS_FLOW)),
            (props) => props.collapsed && !props.collapsed.has(KEY_CANVAS_LIST),
            (props, state) => state.draggingTo,
            (props, state) => state.draggingOver,
            (cursor, hasCanvasFlow, hasCanvasList, draggingTo, draggingOver) => {
                let activeCanvas;
                switch (draggingTo ? draggingTo.position !== POSITION_NONE && draggingOver : cursor?.view) {
                    case KEY_CANVAS_FLOW:
                        if (hasCanvasFlow) {
                            activeCanvas = EditorLayout.LEFT_CANVAS;
                        }
                        break;
                    case KEY_CANVAS_LIST:
                        if (hasCanvasList) {
                            activeCanvas = EditorLayout.RIGHT_CANVAS;
                        }
                        break;
                }
                return activeCanvas;
            },
        );

        this.selectAnchorLabels = (props) => props.automationReport?.anchorLabels ?? [];
        this.selectParentAnchorLabels = (props, nodeUid) => props.automationReport?.nodeReports?.[nodeUid]?.parentAnchorLabels ?? [];

        this.selectNodeMetrics = createSelector(
            (props) => props.nodes,
            (props) => props.triggers,
            (nodes, triggers) => {
                const result = {
                    nodeNumbers: 0,
                    triggerNumbers: 0,
                    map: Object.create(null),
                };
                const setNodeLineNumbers = (nodes) => {
                    if (!nodes || !nodes.length) {
                        return;
                    }
                    nodes.forEach((node) => {
                        if (!node.uid || result.map[node.uid] !== undefined) {
                            return;
                        }
                        result.map[node.uid] = ++result.nodeNumbers;
                        setNodeLineNumbers(node.children);
                        setNodeLineNumbers(node.branches);
                    });
                };
                setNodeLineNumbers(nodes);
                if (triggers?.length) {
                    triggers.forEach((node) => {
                        if (!node.uid || result.map[node.uid] !== undefined) {
                            return;
                        }
                        result.map[node.uid] = ++result.triggerNumbers;
                    });
                }
                return result;
            },
        );

        this.selectCursorSets = createSelector(
            (props) => props.cursor,
            (props) => props.triggers,
            (props) => props.nodes,
            (props) => props.orphans,
            (props) => props.swimlanes,
            (cursor, triggers, nodes, orphans, swimlanes) => {
                const triggerUids = new Set();
                const nodeUids = new Set();
                const swimlaneUids = new Set();
                const disabledUids = new Set();
                const edgeUids = new Set();
                if (!cursor) {
                    return {
                        triggerUids,
                        nodeUids,
                        edgeUids,
                        disabledUids,
                    };
                }
                const cursorUids = new Set([cursor.uid, ...cursor.uids || []].filter(Boolean));
                if (!cursorUids.size) {
                    return {
                        triggerUids,
                        nodeUids,
                        edgeUids,
                        disabledUids,
                    };
                }
                [...cursorUids].forEach((uid) => {
                    if (uid?.startsWith('e') && uid.includes('_')) {
                        edgeUids.add(uid);
                    }
                });
                const allValidUids = new Set();
                const addNodes = (set) => (nodes) => forNodes(nodes, (node) => {
                    if (!node?.uid) {
                        return;
                    }
                    allValidUids.add(node.uid);
                    if (cursorUids.has(node.uid)) {
                        set.add(node.uid);
                        if (node.disabled) {
                            disabledUids.add(node.uid);
                        }
                    }
                });
                addNodes(triggerUids)(triggers);
                addNodes(nodeUids)(nodes);
                addNodes(swimlaneUids)(swimlanes);
                forOrphans(orphans, addNodes(nodeUids));
                edgeUids.forEach((edgeUid) => {
                    const [from, to] = edgeUid.slice(1).split('_', 2);
                    if (!allValidUids.has(from) && !allValidUids.has(to) || nodeUids.has(from) || nodeUids.has(to)) {
                        edgeUids.delete(edgeUid);
                    }
                });
                return {
                    triggerUids,
                    nodeUids,
                    swimlaneUids,
                    edgeUids,
                    disabledUids,
                };
            },
        );

        this.selectCursorTriggerCount = createSelector(
            this.selectCursorSets,
            (cursorSets) => cursorSets.triggerUids.size,
        );

        this.selectCursorCommandCount = createSelector(
            this.selectCursorSets,
            (cursorSets) => cursorSets.nodeUids.size,
        );

        this.selectCursorSwimlaneCount = createSelector(
            this.selectCursorSets,
            (cursorSets) => cursorSets.swimlaneUids.size,
        );

        this.selectCursorCommandCountWithoutRoot = createSelector(
            (props) => props.automationReport,
            this.selectCursorSets,
            (automationReport, cursorSets) => {
                let count = cursorSets.nodeUids.size;
                if (cursorSets.nodeUids.has(automationReport.rootNodeUid)) {
                    count--;
                }
                return count;
            },
        );

        this.selectCursorEdgeCount = createSelector(
            this.selectCursorSets,
            (cursorSets) => cursorSets.edgeUids.size,
        );

        this.selectCursorDisabledCount = createSelector(
            this.selectCursorSets,
            (cursorSets) => cursorSets.disabledUids.size,
        );

        this.selectCursorDetailsCount = createSelector(
            this.selectCursorSets,
            (cursorSets) => cursorSets.triggerUids.size + cursorSets.nodeUids.size + cursorSets.edgeUids.size,
        );

        this.selectCursorBreakpointCount = createSelector(
            this.selectCursorSets,
            (props) => props.breakpoints,
            (cursorSets, breakpoints) => !cursorSets.nodeUids.size || !breakpoints?.length
                ? 0
                : breakpoints.filter((uid) => cursorSets.nodeUids.has(uid)).length,
        );

        this.selectCursorSwimlaneChildCount = createSelector(
            (props) => props.nodes,
            (props) => props.orphans,
            (props) => props.triggers,
            (props) => props.swimlanes,
            (props) => props.cursor,
            (nodes, orphans, triggers, swimlanes, cursor) => {
                if (!cursor?.uid) {
                    return -1;
                }
                const swimlane = swimlanes?.find((swimlane) => swimlane.uid === cursor.uid);
                if (!swimlane) {
                    return -1;
                }
                let count = 0;
                const countNodes = (nodes) => forNodes(nodes, (node) => {
                    if (node.layout?.swimlaneUid !== swimlane.uid) {
                        return;
                    }
                    count++;
                });
                countNodes(nodes);
                forOrphans(orphans, countNodes);
                triggers?.forEach((trigger) => {
                    if (trigger.layout?.swimlaneUid === swimlane.uid) {
                        count++;
                    }
                });
                return count;
            },
        );

        this.selectDetailsNode = createSelector(
            (props) => props.nodes,
            (props) => props.orphans,
            (props) => props.swimlanes,
            (props) => props.triggers,
            (props, state) => state.details,
            (nodes, orphans, swimlanes, triggers, details) => {
                let node;
                if (!details) {
                    return {};
                }
                if (nodes?.length > 0) {
                    node = getNodeWithDisabled(nodes, (node) => details.uid === node.uid);
                    if (node) {
                        return node;
                    }
                }
                if (triggers?.length > 0) {
                    node = getNodeWithDisabled(triggers, (node) => details.uid === node.uid);
                    if (node) {
                        return node;
                    }
                }
                if (orphans?.length > 0) {
                    for (const orphan of orphans) {
                        node = getNodeWithDisabled(orphan.nodes, (node) => details.uid === node.uid);
                        if (node) {
                            return node;
                        }
                    }
                }
                if (swimlanes?.length > 0) {
                    node = getNodeWithDisabled(swimlanes, (node) => details.uid === node.uid);
                    if (node) {
                        return node;
                    }
                }
                return {};
            },
        );

        this.selectRootBusinessAttributes = createSelector(
            (props) => props.nodes,
            (props) => props.commandMap,
            (nodes, commandMap) => {
                const node = nodes?.at(0);
                if (!node) {
                    return [];
                }
                const command = commandMap[getPackageCommandKey(node)];
                if (!command?.root) {
                    return [];
                }
                return node.attributes
                    ?.find(({name}) => name === 'requestAttributes')
                    ?.value
                    ?.list
                    ?.map((value) => {
                        if (!value?.dictionary?.length) {
                            return;
                        }
                        const label = value.dictionary.find(({key}) => key === 'label')?.value?.string;
                        const type = value.dictionary.find(({key}) => key === 'type')?.value?.string;
                        if (label && type) {
                            return {label, type};
                        }
                    })
                    .filter(Boolean);
            },
        );

        this.selectNodeWindows = createSelector(
            (props) => props.nodes,
            (props) => props.triggers,
            (props) => props.variables,
            (nodes, triggers, variables) => {
                const windows = [];
                const searchNodes = (items) => {
                    if (!items || items.length === 0) {
                        return;
                    }

                    items.forEach((item) => {
                        if (!item) {
                            return;
                        }

                        const value = item.value || item.defaultValue;
                        if (value) {
                            let nodeWindow;
                            switch (value.type) {
                                case VALUE_TYPE_WINDOW:
                                    nodeWindow = value.window;
                                    break;
                                case VALUE_TYPE_IMAGE:
                                    nodeWindow = value.window;
                                    break;
                                case VALUE_TYPE_UIOBJECT:
                                    nodeWindow = value.uiObjectWindow && value.uiObjectWindow.window;
                                    break;
                            }
                            if (!nodeWindow || nodeWindow.presetType && nodeWindow.presetType !== WINDOW_PRESET_NONE) {
                                return;
                            }

                            if (!windows.some((otherWindow) => otherWindow.name === nodeWindow.name && isEqual(otherWindow, nodeWindow))) {
                                windows.push(nodeWindow);
                            }
                        }
                        searchNodes(item.attributes);
                        searchNodes(item.children);
                        searchNodes(item.branches);
                    });
                };
                searchNodes(nodes);
                searchNodes(triggers);
                searchNodes(variables);
                return windows;
            },
        );

        this.selectRecorderPackage = createSelector(
            (props) => props.commandMap,
            (props) => props.packageMap,
            (commandMap, packageMap) => {
                const command = Object.values(commandMap).find((command) => command.recordable && command.packageName === PACKAGE_NAME_RECORDER);
                if (!command) {
                    return null;
                }

                const pkg = packageMap[command.packageName];
                return pkg && !pkg.isPackageDisabled ? pkg : null;
            },
        );

        this.selectStartBackgroundDesktopSession = createSelector(
            (props) => props.canRecord,
            (props) => props.defaultDeviceId,
            (props) => Boolean(props.debugger),
            (props) => Boolean(props.running),
            this.selectRecorderPackage,
            (canRecord, defaultDeviceId, isDebugging, isRunning, recorderPackage) => {
                if (!canRecord || !defaultDeviceId || isDebugging || isRunning || !recorderPackage) {
                    return;
                }

                const {startBackgroundDesktopSession} = this.props;
                if (startBackgroundDesktopSession) {
                    startBackgroundDesktopSession(recorderPackage);
                }
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectDetailsVariables = createSelector(
            (props) => props.variables,
            (props) => props.automationType,
            (variables, automationType) => getAutomationTypeIsProcess(automationType)
                ? variables.filter((variable) => variable?.input)
                : variables,
        );

        this.selectOutputVariables = createSelector(
            (props) => props.variables,
            (variables) => variables.filter((variable) => variable?.output),
        );

        this.state = {
            newNodeUid: null,

            error: null,

            editorSize: 'md',

            details: null,
            detailsDebounced: false,
            variableDetails: null,

            finder: null,

            addSwimlanes: null,

            draggingOver: null,
            draggingFrom: null,
            draggingTo: null,
            draggingType: null,
        };
    }

    handleApplyNodeDetails = (callback) => {
        const {onApplyNodeDetails} = this.props;
        onApplyNodeDetails(callback);
    };

    handleCheckUnsaved = (callback) => {
        const {onCheckUnsaved} = this.props;
        if (onCheckUnsaved) {
            onCheckUnsaved(callback, {
                silent: true,
            });
        }
        else {
            callback();
        }
    };

    handleDelayedSave = (delay = 100) => {
        const {onSave} = this.props;
        if (!onSave) {
            return;
        }
        if (delay > 0) {
            setTimeout(onSave, delay);
            return;
        }
        onSave();
    };

    handleWindowFocus = (event) => {
        if (!this._isMounted) {
            return;
        }
        // remove dragging on window focus
        if (event.target === window) {
            const {draggingFrom, draggingTo, draggingOver, draggingType} = this.state;
            if (draggingFrom || draggingTo || draggingOver || draggingType) {
                this.setDragging({draggingFrom: null, draggingTo: null, draggingOver: null, draggingType: null}, false, true);
            }
        }
        // change the cursors canvas when we click inside or outside of a canvas
        const {cursor, onCursorChange} = this.props;
        if (cursor?.view && onCursorChange) {
            const editor = this.editorRef.current;
            if (editor) {
                if (
                    // Skip window target
                    event.target === window ||
                    // Skip non-node targets
                    !(event.target instanceof Node && event.target)
                ) {
                    // Do nothing
                }
                else if (!editor.contains(event.target)) {
                    onCursorChange({
                        ...cursor,
                        view: null,
                    });
                }
                else {
                    let canvas = null;
                    switch (cursor.view) {
                        case KEY_CANVAS_FLOW: {
                            canvas = this.leftCanvasRef.current;
                            break;
                        }
                        case KEY_CANVAS_LIST: {
                            canvas = this.rightCanvasRef.current;
                            break;
                        }
                    }
                    if (canvas && !canvas.contains(event.target)) {
                        onCursorChange({
                            ...cursor,
                            view: null,
                        });
                    }
                }
            }
        }
    };

    handleWindowPointerMove = () => {
        if (!this._isMounted) {
            return;
        }
        // remove dragging on pointer move
        const {draggingFrom, draggingTo, draggingOver, draggingType} = this.state;
        if (draggingFrom || draggingTo || draggingOver || draggingType) {
            this.setDragging({draggingFrom: null, draggingTo: null, draggingOver: null, draggingType: null}, false, true);
        }
    };

    handleSearchToggle = () => {
        const {searchParameters, onSearchParametersChange} = this.props;
        if (!onSearchParametersChange) {
            return;
        }
        if (!searchParameters?.type) {
            onSearchParametersChange({
                type: 'quick',
                canvasLabels: true,
                nodeValueString: searchParameters?.nodeValueString,
                nodeValueVariableName: searchParameters?.nodeValueVariableName,
            });
        }
        else if (searchParameters.type === 'quick') {
            onSearchParametersChange({
                ...searchParameters,
                type: null,
            });
        }
    };

    handleSearchClose = () => {
        const {searchParameters, onSearchParametersChange} = this.props;
        if (!onSearchParametersChange) {
            return;
        }
        if (searchParameters?.type === 'quick') {
            onSearchParametersChange({
                ...searchParameters,
                type: null,
            });
        }
    };

    handleBotStoreLink = () => {
        window.open(BOTSTORE_A2019_URL, '_blank');
    };

    handleEditorSizeChange = (editorSize) => {
        if (this.state.editorSize !== editorSize) {
            this.setState({editorSize});
        }
    };

    handleCanvasFocus = (view) => {
        const {triggers, nodes, cursor, onCursorChange} = this.props;
        if (!onCursorChange) {
            return;
        }
        if (cursor) {
            onCursorChange({
                ...cursor,
                view,
            });
        }
        else if (nodes?.at(0)?.uid) {
            onCursorChange({
                uid: nodes.at(0).uid,
                view,
            });
        }
        else if (triggers?.at(0)?.uid) {
            onCursorChange({
                uid: triggers.at(0).uid,
                view,
            });
        }
    };

    handleCanvasChange = (value) => {
        const {collapsed, onCollapsedChange} = this.props;
        if (collapsed && onCollapsedChange) {
            switch (value) {
                case 'flow':
                    onCollapsedChange(collapsed.remove(KEY_CANVAS_FLOW).add(KEY_CANVAS_LIST).clone());
                    break;
                case 'list':
                    onCollapsedChange(collapsed.add(KEY_CANVAS_FLOW).remove(KEY_CANVAS_LIST).clone());
                    break;
                case 'both':
                    onCollapsedChange(collapsed.remove(KEY_CANVAS_FLOW).remove(KEY_CANVAS_LIST).clone());
                    break;
            }
        }
    };

    handlePaletteResize = (value) => {
        const {onResize} = this.props;
        if (!onResize) {
            return;
        }
        onResize(KEY_PALETTE, value);
    };

    handleCanvasResize = (value) => {
        const {onResize} = this.props;
        if (!onResize) {
            return;
        }
        onResize(KEY_CANVAS, value);
    };

    handleDetailsResize = (value) => {
        const {onResize} = this.props;
        if (!onResize) {
            return;
        }
        onResize(KEY_DETAILS, value);
    };

    handlePaletteActive = (key) => {
        const {collapsed, onCollapsedChange} = this.props;
        if (!onCollapsedChange) {
            return;
        }
        collapsed.add(KEY_PALETTE_ACTIONS);
        collapsed.add(KEY_PALETTE_TRIGGERS);
        collapsed.add(KEY_PALETTE_VARIABLES);
        collapsed.remove(key);
        onCollapsedChange(collapsed.clone());
    };

    handleBreakpointsClear = () => {
        const {onBreakpointsChange} = this.props;
        if (!onBreakpointsChange) {
            return;
        }
        onBreakpointsChange([]);
    };

    handleBreakpointsToggle = () => {
        const {nodes, breakpoints, onBreakpointsChange} = this.props;
        if (!onBreakpointsChange) {
            return;
        }
        const uids = new Set();
        forNodes(nodes, (node) => uids.add(node.uid));
        if (uids.size === 0) {
            return;
        }
        if (breakpoints && breakpoints.length === uids.size) {
            onBreakpointsChange([]);
        }
        else {
            const nextBreakpoints = [...uids];
            nextBreakpoints.sort();
            onBreakpointsChange(nextBreakpoints);
        }
    };

    handleDelete = () => {
        const {automationReport, cursor, triggers, nodes, orphans, swimlanes} = this.props;
        if (!cursor) {
            return;
        }
        if (cursor.uids?.size > 0) {
            this.handleMultipleDelete();
            return;
        }
        if (getAutomationTypeIsProcess(automationReport.type)) {
            const swimlaneChildCount = this.selectCursorSwimlaneChildCount(this.props);
            if (swimlaneChildCount === 0) {
                const swimlane = swimlanes.find((swimlane) => swimlane.uid === cursor.uid);
                if (swimlane) {
                    this.handleSwimlaneDelete(swimlane.uid);
                }
            }
            if (swimlaneChildCount >= 0) {
                return;
            }
        }
        let node = getNode(nodes, (node) => node.uid === cursor.uid);
        if (!node) {
            orphans.some(({nodes}) => {
                node = getNode(nodes, (node) => node.uid === cursor.uid);
                if (node) {
                    return true;
                }
            });
        }
        if (node && node.uid !== automationReport.rootNodeUid) {
            this.handleNodeDelete(node, NODE_TYPE_COMMAND);
            return;
        }
        node = getNode(triggers, (node) => node.uid === cursor.uid);
        if (node) {
            this.handleNodeDelete(node, NODE_TYPE_TRIGGER);
            return;
        }
        if (cursor?.uid?.startsWith('e')) {
            this.handleEdgeDelete(cursor.uid);
        }
    };

    handleCut = () => {
        this.handleApplyNodeDetails(() => {
            const {cursor, triggers, nodes, orphans} = this.props;
            if (!cursor) {
                return;
            }
            if (cursor.uids?.size > 0) {
                this.handleMultipleCut();
                return;
            }
            let node = getNode(nodes, (node) => node.uid === cursor.uid);
            if (!node) {
                orphans.some(({nodes}) => {
                    node = getNode(nodes, (node) => node.uid === cursor.uid);
                    if (node) {
                        return true;
                    }
                });
            }
            if (node) {
                this.handleNodeCut(node, NODE_TYPE_COMMAND);
                return;
            }
            node = getNode(triggers, (node) => node.uid === cursor.uid);
            if (node) {
                this.handleNodeCut(node, NODE_TYPE_TRIGGER);
                return;
            }
            if (cursor?.uid?.startsWith('e')) {
                this.handleEdgeDelete(cursor.uid);
            }
        });
    };

    handleCopy = () => {
        const {automationType, cursor, triggers, nodes, orphans} = this.props;
        if (!cursor) {
            return;
        }
        if (cursor.uids?.size > 0) {
            this.handleMultipleCopy();
            return;
        }
        let node = getNode(nodes, (node) => node.uid === cursor.uid);
        if (getAutomationTypeIsProcess(automationType)) {
            if (!node) {
                orphans.some(({nodes}) => {
                    node = getNode(nodes, (node) => node.uid === cursor.uid);
                    if (node) {
                        return true;
                    }
                });
            }
            if (node) {
                node = {
                    ...node,
                    children: [],
                    branches: [],
                };
            }
        }
        if (node) {
            this.handleNodeCopy(node, NODE_TYPE_COMMAND);
            return;
        }
        node = getNode(triggers, (node) => node.uid === cursor.uid);
        if (node) {
            this.handleNodeCopy(node, NODE_TYPE_TRIGGER);
            return;
        }
    };

    handlePaste = () => {
        this.handleApplyNodeDetails(() => {
            const {clipboard, commandMap, triggerMap, onNodesChange} = this.props;
            if (!clipboard) {
                return;
            }
            if (clipboard.isMultiple) {
                switch (clipboard.nodeType) {
                    case NODE_TYPE_COMMAND:
                        this.handleAppendNodes(clipboard.nodes, {nodeType: NODE_TYPE_COMMAND, orphans: clipboard.orphans, isPaste: true});
                        break;
                    case NODE_TYPE_TRIGGER:
                        this.handleAppendNodes(clipboard.triggers, {nodeType: NODE_TYPE_TRIGGER, isPaste: true});
                        break;

                }
                return;
            }
            switch (clipboard.nodeType) {
                case NODE_TYPE_COMMAND: {
                    if (!onNodesChange) {
                        return;
                    }
                    const node = clipboard.nodes?.at(0);
                    if (!node) {
                        return;
                    }
                    const command = commandMap[getPackageCommandKey(node)];
                    if (!command) {
                        return;
                    }

                    this.handleAppendCommandNode(command, node, {isPaste: true});
                    break;
                }
                case NODE_TYPE_TRIGGER: {
                    if (!onNodesChange) {
                        return;
                    }
                    const node = clipboard.triggers?.at(0);
                    if (!node) {
                        return;
                    }
                    const trigger = triggerMap[getPackageTriggerKey(node)];
                    if (!trigger) {
                        return;
                    }
                    this.handleAppendTriggerNode(trigger, node, {isPaste: true});
                    break;
                }

            }
        });
    };

    handleGlobalCopy = () => {
        const {cursor, nodes, triggers, automationReport, onGlobalCopy} = this.props;
        if (!cursor || !onGlobalCopy) {
            return;
        }
        const uids = new Set();
        if (cursor.uid) {
            uids.add(cursor.uid);
        }
        if (cursor.uids?.size > 0) {
            Array.from(cursor.uids, (uid) => uids.add(uid));
        }
        if (uids.size === 0) {
            return;
        }
        const getIsSelected = (node) => uids.has(node.uid);
        const selectedNodes = [];
        const addNodes = (nodes) => nodes.forEach((node) => {
            if (getIsSelected(node) && automationReport.rootNodeUid !== node.uid) {
                selectedNodes.push(node);
                return;
            }
            if (node.branches) {
                addNodes(node.branches);
            }
            if (node.children) {
                addNodes(node.children);
            }
        });
        addNodes(nodes);
        const nodeCount = selectedNodes.length;
        addNodes(triggers);
        if (selectedNodes.length === 0 || (nodeCount > 0 && selectedNodes.length > nodeCount)) {
            return;
        }
        onGlobalCopy({nodes: selectedNodes});
    };

    handleGlobalCopyVariables = (variables) => {
        const {onGlobalCopy} = this.props;
        if (!onGlobalCopy || !variables?.length) {
            return;
        }
        onGlobalCopy({
            variables,
        });
    };

    handleGlobalPaste = () => {
        const {onGlobalPaste} = this.props;
        if (!onGlobalPaste) {
            return;
        }
        this.handleApplyNodeDetails(() => {
            onGlobalPaste((nodes, onNodesChange, onEmpty) => {
                if (Array.isArray(nodes)) {
                    this.handleAppendNodes(nodes, {onNodesChange, onEmpty});
                }
            });
        });
    };

    handleDisabledToggle = () => {
        this.handleApplyNodeDetails(() => {
            const {cursor, triggers, nodes, onNodesChange} = this.props;
            if (!cursor) {
                return;
            }
            if (cursor.uids?.size > 0) {
                const count = this.selectCursorDisabledCount(this.props);
                if (count < cursor.uids.size + 1) {
                    this.handleMultipleDisable();
                }
                else {
                    this.handleMultipleEnable();
                }
                return;
            }
            let nextNode;
            let nodeType;
            let node = getNode(nodes, (node) => node.uid === cursor.uid);
            if (node) {
                if (!onNodesChange) {
                    return;
                }

                nextNode = {
                    ...node,
                    disabled: !node.disabled,
                };
                nodeType = NODE_TYPE_COMMAND;
            }
            if (!nextNode) {
                node = getNode(triggers, (node) => node.uid === cursor.uid);
                if (node) {
                    if (!onNodesChange) {
                        return;
                    }
                    nextNode = {
                        ...node,
                        disabled: !node.disabled,
                    };
                    nodeType = NODE_TYPE_TRIGGER;
                }
            }
            if (nextNode) {
                this.handleNodeChange(nextNode, nodeType);
            }
        });
    };

    handleBreakpointToggle = () => {
        const {cursor, nodes, breakpoints, onBreakpointsChange} = this.props;
        if (!cursor || !breakpoints || !onBreakpointsChange) {
            return;
        }
        if (cursor.uids?.size > 0) {
            const count = this.selectCursorBreakpointCount(this.props);
            if (count < cursor.uids.size + 1) {
                this.handleMultipleBreakpointEnable();
            }
            else {
                this.handleMultipleBreakpointDisable();
            }
            return;
        }
        const node = getNode(nodes, (node) => node.uid === cursor.uid);
        if (node) {
            if (breakpoints.includes(node.uid)) {
                onBreakpointsChange(breakpoints.filter((uid) => node.uid !== uid));
            }
            else {
                const nextBreakpoints = [...breakpoints, node.uid];
                nextBreakpoints.sort();
                onBreakpointsChange(nextBreakpoints);
            }
        }
    };

    handleMultipleBreakpointEnable = () => {
        const {cursor, breakpoints, onBreakpointsChange} = this.props;
        if (!cursor || !cursor.uids || !breakpoints || !onBreakpointsChange) {
            return;
        }
        let nextBreakpoints = [...breakpoints, cursor.uid, ...cursor.uids];
        nextBreakpoints.sort();
        nextBreakpoints = uniq(nextBreakpoints);
        onBreakpointsChange(nextBreakpoints);
    };

    handleMultipleBreakpointDisable = () => {
        const {cursor, breakpoints, onBreakpointsChange} = this.props;
        if (!cursor || !cursor.uids || !breakpoints || !onBreakpointsChange) {
            return;
        }
        const nextBreakpoints = breakpoints.filter((uid) => uid !== cursor.uid && !cursor.uids.has(uid));
        onBreakpointsChange(nextBreakpoints);
    };

    handleMultipleEnable = () => {
        const {cursor, triggers, nodes, onNodesChange} = this.props;
        if (!cursor || !cursor.uids) {
            return;
        }
        const nodesChanged = [];
        const replaceNodes = (nodes) => {
            let changed = false;
            const nextNodes = nodes.map((node) => {
                if (cursor.uid === node.uid || cursor.uids.has(node.uid)) {
                    changed = true;
                    nodesChanged.push(node);
                    return {
                        ...node,
                        disabled: false,
                    };
                }
                return node;
            });
            return changed ? nextNodes : nodes;
        };
        if (!onNodesChange || (nodes?.length === 0 && triggers?.length === 0)) {
            return;
        }
        const nextNodes = replaceNodesDeep(nodes, replaceNodes);
        const nextTriggers = replaceNodesDeep(triggers, replaceNodes);
        if (nextNodes === nodes && nextTriggers === triggers) {
            return;
        }
        onNodesChange({nodes: nextNodes, triggers: nextTriggers});
        this.setNodesChanged(...nodesChanged);
    };

    handleMultipleDisable = () => {
        const {cursor, triggers, nodes, onNodesChange} = this.props;
        if (!cursor || !cursor.uids) {
            return;
        }

        const nodesChanged = [];
        const replaceNodes = (nodes) => {
            let changed = false;
            const nextNodes = nodes.map((node) => {
                if (cursor.uid === node.uid || cursor.uids.has(node.uid)) {
                    changed = true;
                    nodesChanged.push(node);
                    return {
                        ...node,
                        disabled: true,
                    };
                }
                return node;
            });
            return changed ? nextNodes : nodes;
        };
        if (!onNodesChange || (nodes?.length === 0 && triggers?.length === 0)) {
            return;
        }
        const nextNodes = replaceNodesDeep(nodes, replaceNodes);
        const nextTriggers = replaceNodesDeep(triggers, replaceNodes);
        if (nextNodes === nodes && nextTriggers === triggers) {
            return;
        }
        onNodesChange({nodes: nextNodes, triggers: nextTriggers});
        this.setNodesChanged(...nodesChanged);
    };

    handleMultipleDelete = () => {
        const {automationReport, cursor, packageDetails, triggers, nodes, orphans, swimlanes, onNodesChange, onCursorChange} = this.props;
        if (!cursor || !onCursorChange || !onNodesChange) {
            return;
        }
        const deleteUids = new Set(cursor.uids);
        if (cursor?.uid) {
            deleteUids.add(cursor.uid);
        }
        deleteUids.delete(automationReport.rootNodeUid);
        if (!deleteUids.size) {
            return;
        }
        if (deleteUids.size === 1 && getAutomationTypeIsProcess(automationReport.type)) {
            const swimlaneChildCount = this.selectCursorSwimlaneChildCount(this.props);
            if (swimlaneChildCount === 0) {
                const swimlane = swimlanes.find((swimlane) => deleteUids.has(swimlane.uid));
                if (swimlane) {
                    this.handleSwimlaneDelete(swimlane.uid);
                }
            }
            if (swimlaneChildCount >= 0) {
                return;
            }
        }

        const newOrphans = [];
        const removeNode = getAutomationTypeIsProcess(automationReport.type)
            ? (nodes, isBranch) => {
                const nodeSegments = [[]];
                for (const node of nodes) {
                    if (deleteUids.has(node.uid)) {
                        const command = packageDetails.commandMap[getPackageCommandKey(node)];
                        if (isBranch && command?.branchSplit) {
                            if (node.children?.length > 0) {
                                newOrphans.push({
                                    nodes: node.children,
                                });
                            }
                            continue;
                        }
                        if (node.branches?.length > 0) {
                            if (command?.branchesSplitMerge) {
                                node.branches.forEach((branch) => {
                                    newOrphans.push({
                                        nodes: [branch],
                                    });
                                });
                            }
                            else {
                                newOrphans.push({
                                    nodes: node.branches,
                                });
                            }
                        }
                        if (node.children?.length > 0) {
                            newOrphans.push({
                                nodes: node.children,
                            });
                        }
                        nodeSegments.push([]);
                    }
                    else {
                        nodeSegments.at(-1).push(node);
                    }
                }
                const [connectedSegment, ...disconnectedSegments] = nodeSegments;
                disconnectedSegments.forEach((disconnectedSegment) => {
                    if (disconnectedSegment.length > 0) {
                        newOrphans.push({nodes: disconnectedSegment});
                    }
                });
                return connectedSegment.length < nodes.length ? connectedSegment : nodes;
            }
            : (nodes) => {
                const nextNodes = nodes.filter((node) => !deleteUids.has(node.uid));
                return nextNodes.length < nodes.length ? nextNodes : nodes;
            };
        if (nodes?.length > 0 || orphans?.length > 0 || triggers?.length > 0) {
            const getNextNodes = (nodes) => replaceNodesDeep(nodes, removeNode);
            let nextNodes = getNextNodes(nodes);
            let nextOrphans = getNextOrphans(orphans, getNextNodes);
            if (newOrphans.length > 0) {
                const nextNewOrphans = newOrphans.filter((orphan) => orphan?.nodes?.length > 0);
                if (nextNewOrphans.length > 0) {
                    nextOrphans = [...nextOrphans, ...nextNewOrphans];
                }
            }
            const filteredTriggers = triggers?.filter((trigger) => !deleteUids.has(trigger.uid));
            const nextTriggers = filteredTriggers?.length < triggers?.length ? filteredTriggers : triggers;
            if (getAutomationTypeIsProcess(automationReport.type)) {
                const cursorEdges = getCursorEdges(cursor);
                [nextNodes, nextOrphans] = getNextNodesAndOrphansWithoutEdges(nextNodes, nextOrphans, cursorEdges, packageDetails);
                [nextNodes, nextOrphans] = getNextNodesWithUnlinkedSplitMerge(nextNodes, nextOrphans, packageDetails);
            }
            if (nextNodes === nodes && nextOrphans === orphans && nextTriggers === triggers) {
                return;
            }
            onNodesChange({nodes: nextNodes, orphans: nextOrphans, triggers: nextTriggers});
        }
        onCursorChange(null);
    };

    handleMultipleCopy = () => {
        const {automationType, cursor, onCopy, nodes, orphans, triggers, automationReport} = this.props;
        if (!cursor?.uids?.size || !onCopy) {
            return;
        }
        const clipboard = {
            nodeType: NODE_TYPE_COMMAND,
            triggers: [],
            nodes: [],
            orphans: [],
            isMultiple: true,
        };
        if (getAutomationTypeIsProcess(automationType)) {
            const trees = [];
            const nodeEntriesToScan = [{nodes}, ...orphans];
            const getIsSelected = (node) =>
                automationReport.rootNodeUid !== node.uid &&
                (cursor.uid === node.uid || cursor.uids.has(node.uid));
            const scanSelectedChildren = (nodes) => {
                let isSelected = true;
                return nodes.reduce((result, node, index) => {
                    if (getIsSelected(node)) {
                        if (node.branches?.length > 0) {
                            node.branches = scanSelectedChildren(node.branches);
                        }
                        if (node.children?.length > 0) {
                            node.children = scanSelectedChildren(node.children);
                        }
                        result.push(node);
                    }
                    else if (isSelected) {
                        isSelected = false;
                        nodeEntriesToScan.push({nodes: nodes.slice(index)});
                    }
                    return result;
                }, []);
            };
            const scanNodes = (nodes) => {
                const nextTrees = [{nodes: []}];
                nodes?.forEach((node) => {
                    if (getIsSelected(node)) {
                        const nextNode = structuredClone(node);
                        if (nextNode.branches?.length > 0) {
                            nextNode.branches = scanSelectedChildren(nextNode.branches);
                        }
                        if (nextNode.children?.length > 0) {
                            nextNode.children = scanSelectedChildren(nextNode.children);
                        }
                        nextTrees.at(-1).nodes.push(nextNode);
                        return;
                    }
                    nextTrees.push({nodes: []});
                    if (node.branches?.length > 0) {
                        scanNodes(node.branches);
                    }
                    if (node.children?.length > 0) {
                        scanNodes(node.children);
                    }
                });
                if (nextTrees.length > 0) {
                    trees.push(...nextTrees.filter((tree) => tree.nodes.length > 0));
                }
            };
            while (nodeEntriesToScan.length > 0) {
                const entry = nodeEntriesToScan.shift();
                if (entry?.nodes?.length > 0) {
                    scanNodes(entry.nodes);
                }
            }
            const nextNodesTreeIndex = cursor?.uid
                ? trees.findIndex(({nodes}) => getNode(nodes, (node) => node.uid === cursor.uid))
                : -1;
            if (nextNodesTreeIndex !== -1) {
                clipboard.nodes = trees.at(nextNodesTreeIndex).nodes;
            }
            clipboard.orphans = trees.filter(({nodes}, index) => nodes.length > 0 && index !== nextNodesTreeIndex);
            triggers?.forEach((trigger) => {
                if (getIsSelected(trigger)) {
                    clipboard.triggers.push(trigger);
                }
            });
        }
        else {
            const getIsSelected = (node) => cursor.uid === node.uid || cursor.uids.has(node.uid);
            const addNodes = (result, nodes) => nodes.forEach((node) => {
                if (getIsSelected(node)) {
                    result.push(node);
                    return;
                }
                if (node.branches) {
                    addNodes(result, node.branches);
                }
                if (node.children) {
                    addNodes(result, node.children);
                }
            });
            addNodes(clipboard.nodes, nodes);
            addNodes(clipboard.triggers, triggers);
        }
        if (clipboard.nodes.length > 0 || clipboard.orphans.length > 0) {
            clipboard.triggers = [];
        }
        else if (clipboard.triggers.length > 0) {
            clipboard.nodeType = NODE_TYPE_TRIGGER;
        }
        else {
            return;
        }
        onCopy(clipboard);
    };

    handleMultipleCut = () => {
        const {cursor, onCopy, onCursorChange} = this.props;
        if (!cursor || !cursor.uids || !onCopy || !onCursorChange) {
            return;
        }
        this.handleMultipleCopy();
        this.handleMultipleDelete();
    };

    handleAppendCommand = (command, options = {}) => {
        this.handleApplyNodeDetails(() => {
            const {commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap, onNodesChange} = this.props;
            if (!command || !onNodesChange) {
                return;
            }
            const node = createNode(command, 'commandName', commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap);
            if (options?.layout) {
                node.layout = options.layout;
            }
            if (options.attributeValues?.length > 0) {
                const names = new Set(options.attributeValues.map(({name}) => name));
                node.attributes = [
                    ...(node.attributes || []).filter(({name}) => !names.has(name)),
                    ...options.attributeValues,
                ];
            }
            this.handleAppendCommandNode(command, node, options);
        });
    };

    handleAppendTriggerNode = (trigger, node, options = {}) => {
        this.handleApplyNodeDetails(() => {
            const {
                automationType,
                collapsed,
                cursor, onCursorChange,
                triggers, triggerMap, onNodesChange,
                iteratorMap, conditionalMap, exceptionMap,
            } = this.props;
            if (!trigger || !onNodesChange) {
                return;
            }
            let view = cursor && cursor.view;
            if (!view) {
                view = getAutomationTypeIsProcess(automationType) || !collapsed.has(KEY_CANVAS_FLOW) ? KEY_CANVAS_FLOW : KEY_CANVAS_LIST;
            }
            const newTriggerNode = node || {
                triggerName: trigger.name,
                packageName: trigger.packageName,
                attributes: getDefaultAttributes(trigger.attributes, iteratorMap, conditionalMap, triggerMap, exceptionMap),
            };
            if (trigger.anchorDefaultValue) {
                newTriggerNode.anchor = trigger.anchorDefaultValue;
            }
            const nextNode = cloneNode(newTriggerNode, [], triggerMap, NODE_TYPE_TRIGGER);
            if (options.isPaste && node?.layout && typeof node.layout.x === 'number' && typeof node.layout.y === 'number') {
                nextNode.layout = {
                    copiedPosition: {x: node.layout.x, y: node.layout.y},
                };
            }
            let nextTriggers;
            if (cursor) {
                const cursorIndex = triggers.findIndex((node) => node.uid === cursor.uid);
                if (cursorIndex !== -1) {
                    nextTriggers = [
                        ...triggers.slice(0, cursorIndex + 1),
                        nextNode,
                        ...triggers.slice(cursorIndex + 1),
                    ];
                }
            }
            if (!nextTriggers) {
                nextTriggers = [
                    ...triggers,
                    nextNode,
                ];
            }
            onNodesChange({triggers: nextTriggers});
            onCursorChange({uid: nextNode.uid, view});
            this.setState({newNodeUid: nextNode.uid});
            this.setNodesChanged(nextNode);
        });
    };

    handleAppendCommandNode = (command, node, options = {}) => {
        this.handleApplyNodeDetails(() => {
            const {automationType, cursor, collapsed, commandMap, nodes, orphans, swimlanes, onNodesChange, onCursorChange} = this.props;
            if (!command || !node || !onNodesChange || !onCursorChange) {
                return;
            }
            if (getAutomationTypeIsProcess(automationType)) {
                const insertMode = options.isPaste ? 'PASTE' : 'NEW';
                const optionsLayout = options.layout;
                const targetNodeUid = options.isOrphan
                    ? null
                    : options.appendToNode?.uid || cursor?.uid || getLastNodeUid(nodes);
                let nextNodes = nodes;
                let nextOrphans = orphans;
                const nextSwimlanes = swimlanes;
                const getSwimlaneUid = (targetNodeUid) => {
                    if (swimlanes.length > 0) {
                        let swimlaneUid = optionsLayout?.swimlaneUid;
                        if (!swimlaneUid && targetNodeUid) {
                            swimlaneUid = getNodeSwimlaneUid(nodes, orphans, (node) => node.uid === targetNodeUid);
                        }
                        if (!swimlaneUid) {
                            swimlaneUid = swimlanes.at(0).uid;
                        }
                        return swimlaneUid;
                    }
                    return null;
                };
                const applySwimlaneUid = (newNodes, targetNodeUid) => {
                    if (swimlanes.length > 0) {
                        const swimlaneUid = getSwimlaneUid(targetNodeUid);
                        forNodes(newNodes, (node) => {
                            node.layout = {
                                ...node.layout || {},
                                swimlaneUid,
                            };
                        });
                    }
                };
                const newNode = cloneNode(node, [], commandMap, NODE_TYPE_COMMAND);
                if (!newNode) {
                    return;
                }
                applySwimlaneUid([newNode], targetNodeUid);
                forNodesWithMetadata([newNode], (node, context) => {
                    node.layout = {
                        ...node.layout || {},
                        initialNodeId: node.layout?.initialNodeId
                            ? node.layout.initialNodeId
                            : context.index > 0
                                ? context.nodes.at(context.index - 1)?.uid
                                : context.parentNodes?.at(-1)?.uid,
                    };
                });
                let newOrphanNode;
                if (targetNodeUid && getCanProcessInsertNodes(insertMode, [newNode], nodes, orphans, targetNodeUid, commandMap)) {
                    if (!newNode.layout.initialNodeId) {
                        newNode.layout.initialNodeId = targetNodeUid;
                    }
                    if (swimlanes.length > 0 && optionsLayout?.swimlaneUid) {
                        newNode.layout.swimlaneUid = optionsLayout.swimlaneUid;
                    }
                    if (optionsLayout?.initialPosition) {
                        newNode.layout.initialPosition = optionsLayout.initialPosition;
                    }
                    let updateNodes;
                    if (command.firstChildMerge && command.firstChildOf) {
                        updateNodes = (nodes) => {
                            const sourceContext = getNodeContext(nodes, (node) => node.uid === targetNodeUid, {includeBranchParent: true});
                            if (!sourceContext) {
                                return nodes;
                            }
                            const splitParent = sourceContext.parents.reverse().find((parent) => parent.commandName === command.firstChildOf);
                            if (!splitParent || splitParent.children?.length > 0) {
                                return nodes;
                            }
                            return replaceNodes(
                                nodes,
                                (node) => node.uid === splitParent.uid,
                                (nodes, node, index) => {
                                    const nextNodes = [...nodes];
                                    nextNodes[index] = {
                                        ...node,
                                        children: [newNode],
                                    };
                                    return nextNodes;
                                },
                            );
                        };
                    }
                    else {
                        updateNodes = (nodes) => replaceNodes(
                            nodes,
                            (node) => node.uid === targetNodeUid,
                            (nodes, targetNode, index, isBranch) => {
                                const targetCommand = commandMap[getPackageCommandKey(targetNode)];
                                const beforeNodes = nodes.slice(0, index);
                                let afterNodes = nodes.slice(index + 1);
                                if (command.branchOf) {
                                    // Add as a sibling branch
                                    if (isBranch) {
                                        return [
                                            ...beforeNodes,
                                            targetNode,
                                            newNode,
                                            ...afterNodes,
                                        ];
                                    }
                                    // for split, add to the end of its branches
                                    const branchParentCommand = commandMap[getPackageCommandKey({packageName: command.packageName, commandName: command.branchOf})];
                                    if (branchParentCommand?.branchesSplitMerge) {
                                        return [
                                            ...beforeNodes,
                                            {
                                                ...targetNode,
                                                branches: [
                                                    ...targetNode.branches ?? [],
                                                    newNode,
                                                ],
                                            },
                                            ...afterNodes,
                                        ];
                                    }
                                    // otherwise, add the the beginning of its branches
                                    return [
                                        ...beforeNodes,
                                        {
                                            ...targetNode,
                                            branches: [
                                                newNode,
                                                ...targetNode.branches ?? [],
                                            ],
                                        },
                                        ...afterNodes,
                                    ];
                                }
                                if (targetCommand?.nestable && !targetCommand.branchesSplitMerge) {
                                    if (isBranch) {
                                        if (command.branchesSplitMerge) {
                                            return [
                                                ...beforeNodes,
                                                {
                                                    ...targetNode,
                                                    children: [
                                                        {
                                                            ...newNode,
                                                            children: [
                                                                ...newNode.children || [],
                                                                ...targetNode.children ?? [],
                                                            ],
                                                        },
                                                    ],
                                                },
                                                ...afterNodes,
                                            ];
                                        }
                                        if (command.nestable && command.nestableLeaf) {
                                            return [
                                                ...beforeNodes,
                                                {
                                                    ...targetNode,
                                                    children: [
                                                        {
                                                            ...newNode,
                                                            children: targetNode.children || newNode.children || [],
                                                        },
                                                    ],
                                                },
                                                ...afterNodes,
                                            ];
                                        }
                                        return [
                                            ...beforeNodes,
                                            {
                                                ...targetNode,
                                                children: [
                                                    newNode,
                                                    ...targetNode.children ?? [],
                                                ],
                                            },
                                            ...afterNodes,
                                        ];
                                    }
                                    afterNodes = targetNode.children || [];
                                    if (command.branchesSplitMerge) {
                                        return [
                                            ...beforeNodes,
                                            {
                                                ...targetNode,
                                                children: [
                                                    afterNodes.length > 0
                                                        ? {
                                                            ...newNode,
                                                            children: [
                                                                ...newNode.children || [],
                                                                ...afterNodes,
                                                            ],
                                                        }
                                                        : newNode,
                                                ],
                                            },
                                        ];
                                    }
                                    if (command.nestable) {
                                        return [
                                            ...beforeNodes,
                                            {
                                                ...targetNode,
                                                children: [
                                                    afterNodes.length > 0
                                                        ? {
                                                            ...newNode,
                                                            children: afterNodes,
                                                        }
                                                        : newNode,
                                                ],
                                            },
                                        ];
                                    }
                                    return [
                                        ...beforeNodes,
                                        {
                                            ...targetNode,
                                            children: [
                                                newNode,
                                                ...afterNodes,
                                            ],
                                        },
                                    ];
                                }
                                if (command.branchesSplitMerge) {
                                    return [
                                        ...beforeNodes,
                                        targetNode,
                                        {
                                            ...newNode,
                                            children: [
                                                ...newNode.children || [],
                                                ...afterNodes,
                                            ],
                                        },
                                    ];
                                }
                                if (command.nestable) {
                                    const getChildren = (newChildren, oldChildren) => {
                                        if (command.branchesMergeName) {
                                            const newFirstChild = newChildren?.at(0);
                                            if (
                                                newFirstChild.commandName === command.branchesMergeName &&
                                                newFirstChild.packageName === command.packageName
                                            ) {
                                                return [...newChildren, ...oldChildren || []];
                                            }
                                        }
                                        return oldChildren;
                                    };
                                    return [
                                        ...beforeNodes,
                                        targetNode,
                                        afterNodes.length > 0
                                            ? {
                                                ...newNode,
                                                children: getChildren(newNode.children, afterNodes),
                                            }
                                            : newNode,
                                    ];
                                }
                                return [
                                    ...beforeNodes,
                                    targetNode,
                                    newNode,
                                    ...afterNodes,
                                ];
                            },
                        );
                    }
                    nextNodes = updateNodes(nodes);
                    nextOrphans = getNextOrphans(orphans, updateNodes);
                }
                else {
                    if (options.isPaste && newNode.layout) {
                        newNode.layout = {
                            ...newNode.layout,
                            copiedPosition: {
                                x: newNode.layout.x,
                                y: newNode.layout.y,
                            },
                        };
                    }
                    newOrphanNode = newNode;
                }
                if (options.orphans?.length > 0) {
                    nextOrphans = [
                        ...nextOrphans,
                        ...options.orphans
                            .map(({nodes}) => {
                                const nextNodes = nodes
                                    .map((node) => cloneNode(node, [], commandMap, NODE_TYPE_COMMAND))
                                    .filter(Boolean);
                                if (options.isPaste) {
                                    forNodes(nextNodes, (newNode) => {
                                        newNode.layout = {
                                            ...newNode.layout || {},
                                            copiedPosition: {
                                                x: newNode.layout.x,
                                                y: newNode.layout.y,
                                            },
                                        };
                                    });
                                }
                                applySwimlaneUid(nextNodes, targetNodeUid);
                                if (nextNodes.length > 0) {
                                    return {nodes: nextNodes};
                                }
                            })
                            .filter(Boolean),
                    ];
                }
                if (newOrphanNode) {
                    nextOrphans = [...nextOrphans, {nodes: [newOrphanNode]}];
                }
                onNodesChange({nodes: nextNodes, orphans: nextOrphans, swimlanes: nextSwimlanes});
                onCursorChange({uid: newNode.uid, view: KEY_CANVAS_FLOW});
                this.setState({newNodeUid: newNode.uid});
                this.setNodesChanged(newNode);
                return;
            }
            const targetNodeUid = options.appendToNode?.uid || cursor?.uid;
            const atNodeUid = targetNodeUid ? getNode(nodes, (node) => node.uid === targetNodeUid)?.uid : null;
            let view = cursor?.view;
            if (!view) {
                view = !collapsed.has(KEY_CANVAS_FLOW) ? KEY_CANVAS_FLOW : KEY_CANVAS_LIST;
            }
            if (atNodeUid) {
                const targetContext = getNodeContext(nodes, (node) => node.uid === atNodeUid);
                if (!targetContext) {
                    const nextNode = cloneNode(node, [], commandMap, NODE_TYPE_COMMAND);
                    if (!nextNode) {
                        return;
                    }
                    onNodesChange({
                        nodes: [
                            ...nodes,
                            nextNode,
                        ],
                    });
                    onCursorChange({uid: nextNode.uid, view});
                    this.setState({newNodeUid: nextNode.uid});
                    this.setNodesChanged(nextNode);
                    return;
                }
                let cursorParents = targetContext.parents;
                const cursorRoot = targetContext.root;
                const cursorNode = targetContext.node;
                if (!cursorNode) {
                    return;
                }
                const atCommand = commandMap[getPackageCommandKey(cursorNode)];
                if (!atCommand) {
                    return;
                }
                if (command.branchOf) {
                    if (collapsed.has(`node:${cursorNode.uid}`)) {
                        return;
                    }
                    if (atCommand.branchOf) {
                        if (
                            !cursorRoot ||
                            atCommand.branchOf !== command.branchOf ||
                            atCommand.packageName !== command.packageName ||
                            atCommand.branchEnd
                        ) {
                            return;
                        }
                        if (command.branchEnd) {
                            const lastNode = cursorRoot.branches?.at(-1);
                            if (lastNode) {
                                const lastCommand = commandMap[getPackageCommandKey(lastNode)];
                                if (!lastCommand || lastCommand.branchEnd) {
                                    return;
                                }
                            }
                            const nextNode = cloneNode(node, cursorParents, commandMap, NODE_TYPE_COMMAND);
                            if (!nextNode) {
                                return;
                            }
                            onNodesChange({
                                nodes: replaceNodes(
                                    nodes,
                                    (node) => node.uid === cursorRoot.uid,
                                    (nodes, node, index) => [
                                        ...nodes.slice(0, index),
                                        {
                                            ...node,
                                            branches: [
                                                ...node.branches,
                                                nextNode,
                                            ],
                                        },
                                        ...nodes.slice(index + 1),
                                    ],
                                ),
                            });
                            onCursorChange({uid: nextNode.uid, view});
                            this.setState({newNodeUid: nextNode.uid});
                            this.setNodesChanged(nextNode);
                            return;
                        }
                        const nextNode = cloneNode(node, cursorParents, commandMap, NODE_TYPE_COMMAND);
                        if (!nextNode) {
                            return;
                        }
                        onNodesChange({
                            nodes: replaceNodes(
                                nodes,
                                (node) => node.uid === cursorNode.uid,
                                (nodes, node, index) => [
                                    ...nodes.slice(0, index + 1),
                                    nextNode,
                                    ...nodes.slice(index + 1),
                                ],
                            ),
                        });
                        onCursorChange({uid: nextNode.uid, view});
                        this.setState({newNodeUid: nextNode.uid});
                        this.setNodesChanged(nextNode);
                        return;
                    }
                    if (atCommand.name !== command.branchOf || atCommand.packageName !== command.packageName) {
                        return;
                    }
                    if (command.branchEnd) {
                        const lastNode = cursorNode.branches?.at(-1);
                        if (lastNode) {
                            const lastCommand = commandMap[getPackageCommandKey(lastNode)];
                            if (!lastCommand || lastCommand.branchEnd) {
                                return;
                            }
                        }
                        const nextNode = cloneNode(node, cursorParents, commandMap, NODE_TYPE_COMMAND);
                        if (!nextNode) {
                            return;
                        }
                        onNodesChange({
                            nodes: replaceNodes(
                                nodes,
                                (node) => node.uid === cursorNode.uid,
                                (nodes, node, index) => [
                                    ...nodes.slice(0, index),
                                    {
                                        ...node,
                                        branches: [
                                            ...node.branches,
                                            nextNode,
                                        ],
                                    },
                                    ...nodes.slice(index + 1),
                                ],
                            ),
                        });
                        onCursorChange({uid: nextNode.uid, view});
                        this.setState({newNodeUid: nextNode.uid});
                        this.setNodesChanged(nextNode);
                        return;
                    }
                    const nextNode = cloneNode(node, cursorParents, commandMap, NODE_TYPE_COMMAND);
                    if (!nextNode) {
                        return;
                    }
                    onNodesChange({
                        nodes: replaceNodes(
                            nodes,
                            (node) => node.uid === cursorNode.uid,
                            (nodes, node, index) => [
                                ...nodes.slice(0, index),
                                {
                                    ...node,
                                    branches: [
                                        nextNode,
                                        ...node.branches,
                                    ],
                                },
                                ...nodes.slice(index + 1),
                            ],
                        ),
                    });
                    onCursorChange({uid: nextNode.uid, view});
                    this.setState({newNodeUid: nextNode.uid});
                    this.setNodesChanged(nextNode);
                    return;
                }
                if (atCommand.branchOf && collapsed.has(`node:${cursorNode.uid}`)) {
                    return;
                }
                if (atCommand.nestable && !collapsed.has(`node:${cursorNode.uid}`)) {
                    cursorParents = [...cursorParents, cursorNode];
                    const nextNode = cloneNode(node, cursorParents, commandMap, NODE_TYPE_COMMAND);
                    if (!nextNode) {
                        return;
                    }
                    onNodesChange({
                        nodes: replaceNodes(
                            nodes,
                            (node) => node.uid === cursorNode.uid,
                            (nodes, node, index) => [
                                ...nodes.slice(0, index),
                                {
                                    ...node,
                                    children: [
                                        nextNode,
                                        ...node.children,
                                    ],
                                },
                                ...nodes.slice(index + 1),
                            ],
                        ),
                    });
                    onCursorChange({uid: nextNode.uid, view});
                    this.setState({newNodeUid: nextNode.uid});
                    this.setNodesChanged(nextNode);
                    return;
                }
                const nextNode = cloneNode(node, cursorParents, commandMap, NODE_TYPE_COMMAND);
                if (!nextNode) {
                    return;
                }
                onNodesChange({
                    nodes: replaceNodes(
                        nodes,
                        (node) => node.uid === cursorNode.uid,
                        (nodes, node, index) => [
                            ...nodes.slice(0, index + 1),
                            nextNode,
                            ...nodes.slice(index + 1),
                        ],
                    ),
                });
                onCursorChange({uid: nextNode.uid, view});
                this.setState({newNodeUid: nextNode.uid});
                this.setNodesChanged(nextNode);
                return;
            }
            else if (command.branchOf || command.ancestorOf) {
                return;
            }
            const nextNode = cloneNode(node, [], commandMap, NODE_TYPE_COMMAND);
            if (!nextNode) {
                return;
            }
            onNodesChange({
                nodes: [
                    ...nodes,
                    nextNode,
                ],
            });
            onCursorChange({uid: nextNode.uid, view});
            this.setState({newNodeUid: nextNode.uid});
            this.setNodesChanged(nextNode);
        });
    };

    handleAppendNodes = (
        appendNodes,
        {
            nodeType: nodeTypeArg,
            targetUid: targetUidArg,
            onNodesChange: onNodesChangeArg,
            orphans: orphansArg,
            onEmpty,
            isPaste = false,
        } = {},
    ) => {
        this.handleApplyNodeDetails(() => {
            const {
                automationType,
                cursor,
                collapsed,
                triggers: lastTriggers,
                nodes: lastNodes,
                orphans: lastOrphans,
                swimlanes,
                triggerMap,
                commandMap,
                onNodesChange: onNodesChangeProp,
                onCursorChange,
            } = this.props;
            if (!appendNodes?.length && !orphansArg?.length) {
                return;
            }
            const nodeType = nodeTypeArg || (appendNodes.at(0)?.triggerName ? NODE_TYPE_TRIGGER : NODE_TYPE_COMMAND);
            switch (nodeType) {
                case NODE_TYPE_TRIGGER: {
                    const onNodesChange = onNodesChangeArg || onNodesChangeProp;
                    if (!onNodesChange) {
                        return;
                    }
                    const newTriggers = appendNodes
                        .map((node) => {
                            const newNode = cloneNode(node, [], triggerMap, NODE_TYPE_TRIGGER);
                            if (isPaste && node?.layout && typeof node.layout.x === 'number' && typeof node.layout.y === 'number') {
                                newNode.layout = {
                                    copiedPosition: {x: node.layout.x, y: node.layout.y},
                                };
                            }
                            return newNode;
                        })
                        .filter(Boolean);
                    if (newTriggers.length === 0) {
                        if (onEmpty) {
                            onEmpty();
                        }
                        return;
                    }
                    if (cursor) {
                        const cursorIndex = lastTriggers.findIndex((node) => node.uid === cursor.uid);
                        if (cursorIndex !== -1) {
                            onNodesChange({
                                triggers: [
                                    ...lastTriggers.slice(0, cursorIndex + 1),
                                    ...newTriggers,
                                    ...lastTriggers.slice(cursorIndex + 1),
                                ],
                            });
                            this.setNodesChanged(...newTriggers);
                            return;
                        }
                    }
                    onNodesChange({
                        triggers: [
                            ...lastTriggers,
                            ...newTriggers,
                        ],
                    });
                    this.setNodesChanged(...newTriggers);
                    break;
                }
                case NODE_TYPE_COMMAND: {
                    const onNodesChange = onNodesChangeArg || onNodesChangeProp;
                    if (!onNodesChange) {
                        return;
                    }
                    const changedNodes = [];
                    if (getAutomationTypeIsProcess(automationType)) {
                        const targetNodeUid = targetUidArg || cursor?.uid || getLastNodeUid(lastNodes);
                        let nextCursor = cursor;
                        let nextNodes = lastNodes;
                        let nextOrphans = lastOrphans;
                        const applySwimlaneUid = (newNodes, targetNodeUid) => {
                            if (swimlanes?.length > 0) {
                                let swimlaneUid = null;
                                if (targetNodeUid) {
                                    swimlaneUid = getNodeSwimlaneUid(nextNodes, nextOrphans, (node) => node.uid === targetNodeUid);
                                }
                                if (!swimlaneUid) {
                                    swimlaneUid = swimlanes.at(0).uid;
                                }
                                forNodes(newNodes, (node) => {
                                    node.layout = {
                                        ...node.layout || {},
                                        swimlaneUid,
                                    };
                                });
                            }
                            else {
                                forNodes(newNodes, (node) => {
                                    node.layout = {
                                        ...node.layout || {},
                                        swimlaneUid: null,
                                    };
                                });
                            }
                        };
                        const newNodes = appendNodes
                            .map((node) => cloneNode(node, [], commandMap, NODE_TYPE_COMMAND))
                            .filter(Boolean);
                        if (newNodes.length > 0) {
                            applySwimlaneUid(newNodes, targetNodeUid);
                            changedNodes.push(...newNodes);
                            const uid = newNodes.at(0)?.uid;
                            const uids = new CheapSet();
                            forNodes(newNodes, (newNode) => uids.add(newNode.uid));
                            uids.remove(uid);
                            nextCursor = {uid, uids, view: KEY_CANVAS_FLOW};
                            forNodesWithMetadata(newNodes, (node, context) => {
                                node.layout = {
                                    ...node.layout || {},
                                    initialNodeId: context.index > 0
                                        ? context.nodes.at(context.index - 1)?.uid
                                        : context.parentNodes?.at(-1)?.uid,
                                };
                            });
                        }
                        const firstNewCommand = newNodes.length > 0
                            ? commandMap[getPackageCommandKey(newNodes.at(0))]
                            : null;
                        if (
                            firstNewCommand &&
                            !firstNewCommand.nestable && // TODO remove once we can paste nestable into data
                            targetNodeUid &&
                            newNodes.length > 0 &&
                            getCanProcessInsertNodes('PASTE', newNodes, nextNodes, nextOrphans, targetNodeUid, commandMap)
                        ) {
                            applySwimlaneUid(newNodes, targetNodeUid);
                            const firstNewNode = newNodes.at(0);
                            if (firstNewNode) {
                                firstNewNode.layout = {
                                    ...firstNewNode.layout || {},
                                    initialNodeId: targetNodeUid,
                                };
                            }
                            const getNestableChildrenWithoutLeaf = (children) => {
                                const lastCommand = commandMap[getPackageCommandKey(children.at(-1))];
                                return lastCommand?.leaf && !lastCommand.nestable
                                    ? children.slice(0, -1)
                                    : children;
                            };
                            const getAppendedNodes = (beforeNodes, afterNodes) => {
                                const lastBeforeNode = beforeNodes.at(-1);
                                const lastBeforeCommand = commandMap[getPackageCommandKey(lastBeforeNode)];
                                if (lastBeforeCommand?.nestable && !lastBeforeCommand.branchesSplitMerge && lastBeforeCommand.nestableLeaf) {
                                    return [
                                        ...beforeNodes.slice(0, -1),
                                        {
                                            ...lastBeforeNode,
                                            children: lastBeforeNode.children?.length > 0
                                                ? getAppendedNodes(
                                                    getNestableChildrenWithoutLeaf(lastBeforeNode.children),
                                                    afterNodes,
                                                )
                                                : afterNodes,
                                        },
                                    ];
                                }
                                return [
                                    ...beforeNodes,
                                    ...afterNodes,
                                ];
                            };
                            const updateNodes = (nodes) => replaceNodes(
                                nodes,
                                (node) => node.uid === targetNodeUid,
                                (nodes, targetNode, index, isBranch) => {
                                    const beforeNodes = nodes.slice(0, index);
                                    let afterNodes = nodes.slice(index + 1);
                                    if (firstNewCommand.branchOf) {
                                        if (isBranch) {
                                            return [
                                                ...beforeNodes,
                                                ...getAppendedNodes(
                                                    [targetNode],
                                                    getAppendedNodes(newNodes, afterNodes),
                                                ),
                                            ];
                                        }
                                        return [
                                            ...beforeNodes,
                                            {
                                                ...targetNode,
                                                branches: [
                                                    ...newNodes,
                                                    ...targetNode.branches ?? [],
                                                ],
                                            },
                                            ...afterNodes,
                                        ];
                                    }
                                    const targetNodeCommand = commandMap[getPackageCommandKey(targetNode)];
                                    if (targetNodeCommand.nestable && !targetNodeCommand.branchesSplitMerge) {
                                        if (isBranch) {
                                            return [
                                                ...beforeNodes,
                                                {
                                                    ...targetNode,
                                                    children: targetNode.children?.length > 0
                                                        ? getAppendedNodes(
                                                            newNodes,
                                                            targetNode.children,
                                                        )
                                                        : newNodes,
                                                },
                                                ...afterNodes,
                                            ];
                                        }
                                        afterNodes = targetNode.children || [];
                                        if (firstNewCommand.nestable && !firstNewCommand.branchesSplitMerge) {
                                            // TODO insert with first node as nestable
                                            return nodes;
                                        }
                                        return [
                                            ...beforeNodes,
                                            {
                                                ...targetNode,
                                                children: getAppendedNodes(
                                                    newNodes,
                                                    afterNodes,
                                                ),
                                            },
                                        ];
                                    }
                                    if (firstNewCommand.nestable && !firstNewCommand.branchesSplitMerge) {
                                        // TODO insert with first node as nestable
                                        return nodes;
                                    }
                                    return [
                                        ...beforeNodes,
                                        ...getAppendedNodes(
                                            [targetNode],
                                            getAppendedNodes(
                                                newNodes,
                                                afterNodes,
                                            ),
                                        ),
                                    ];
                                },
                            );
                            nextNodes = updateNodes(nextNodes);
                            nextOrphans = getNextOrphans(nextOrphans, updateNodes);
                        }
                        else {
                            if (isPaste) {
                                forNodes(newNodes, (newNode) => {
                                    newNode.layout = {
                                        ...newNode.layout || {},
                                        copiedPosition: {
                                            x: newNode.layout.x,
                                            y: newNode.layout.y,
                                        },
                                    };
                                });
                            }
                            // add orphan info
                            nextOrphans = [
                                ...nextOrphans,
                                {nodes: newNodes},
                            ];
                        }
                        if (orphansArg?.length > 0) {
                            const cursorUids = new CheapSet(nextCursor?.uids);
                            nextOrphans = [
                                ...nextOrphans,
                                ...orphansArg
                                    .map(({nodes}) => {
                                        const newNodes = nodes
                                            .map((node) => cloneNode(node, [], commandMap, NODE_TYPE_COMMAND))
                                            .filter(Boolean);
                                        forNodes(newNodes, (newNode) => {
                                            if (isPaste && newNode.layout) {
                                                newNode.layout = {
                                                    ...newNode.layout,
                                                    copiedPosition: {
                                                        x: newNode.layout.x,
                                                        y: newNode.layout.y,
                                                    },
                                                };
                                                cursorUids.add(newNode.uid);
                                            }
                                        });
                                        applySwimlaneUid(nextNodes);
                                        if (newNodes.length > 0) {
                                            changedNodes.push(...newNodes);
                                            return {nodes: newNodes};
                                        }
                                    })
                                    .filter(Boolean),
                            ];
                            if (nextCursor && cursor !== nextCursor) {
                                nextCursor.uids = cursorUids;
                            }
                        }
                        if (lastNodes === nextNodes && lastOrphans === nextOrphans) {
                            if (onEmpty) {
                                onEmpty();
                            }
                            return;
                        }
                        onNodesChange({nodes: nextNodes, orphans: nextOrphans});
                        if (nextCursor !== cursor) {
                            onCursorChange(nextCursor);
                        }
                        this.setNodesChanged(...changedNodes);
                        return;
                    }
                    const targetUid = targetUidArg || cursor?.uid;
                    const targetContext = targetUid && getNodeContext(lastNodes, (node) => node.uid === targetUid);
                    if (!targetContext) {
                        const newNodes = appendNodes
                            .map((node) => cloneNode(node, [], commandMap, NODE_TYPE_COMMAND))
                            .filter(Boolean);
                        changedNodes.push(...newNodes);
                        if (changedNodes.length === 0) {
                            if (onEmpty) {
                                onEmpty();
                            }
                            return;
                        }
                        onNodesChange({
                            nodes: [
                                ...lastNodes,
                                ...newNodes,
                            ],
                        });
                        this.setNodesChanged(...changedNodes);
                        return;
                    }
                    const newNodes = appendNodes
                        .map((node) => cloneNode(node, targetContext.parents, commandMap, NODE_TYPE_COMMAND))
                        .filter(Boolean);
                    changedNodes.push(...newNodes);
                    if (changedNodes.length === 0) {
                        if (onEmpty) {
                            onEmpty();
                        }
                        return;
                    }
                    const nextNodes = replaceNodes(
                        lastNodes,
                        (node) => node.uid === targetUid,
                        (nodes, node, index) => {
                            const command = commandMap[getPackageCommandKey(node)];
                            if (command?.nestable && !collapsed.has(`node:${node.uid}`)) {
                                return [
                                    ...nodes.slice(0, index),
                                    {
                                        ...node,
                                        children: [
                                            ...newNodes,
                                            ...node.children,
                                        ],
                                    },
                                    ...nodes.slice(index + 1),
                                ];
                            }
                            return [
                                ...nodes.slice(0, index + 1),
                                ...newNodes,
                                ...nodes.slice(index + 1),
                            ];
                        },
                    );
                    onNodesChange({nodes: nextNodes});
                    this.setNodesChanged(...changedNodes);
                    break;
                }
            }
        });
    };

    handleDrop = (event) => {
        const {draggingTo, draggingOver, draggingType} = this.state;
        if (!draggingTo || draggingTo.position === POSITION_NONE) {
            if (draggingTo || draggingOver || draggingType) {
                this.setDragging({draggingFrom: null, draggingTo: null, draggingOver: null, draggingType: null}, false, true);
            }
            return;
        }
        clearTimeout(this.dragTimeout);
        event.stopPropagation();
        event.preventDefault();
        const editorDragging = fromLocalStorage('editor-dragging', null);
        this.setDragging({draggingFrom: null, draggingTo: null, draggingOver: null, draggingType: null}, false, true);
        if (!editorDragging?.type === 'CREATE' && !editorDragging?.type !== 'MOVE') {
            return;
        }
        this.handleApplyNodeDetails(() => {
            const {
                nodes,
                automationType,
                commandMap, commandNameKey,
                iteratorMap, conditionalMap, triggerMap, exceptionMap,
                collapsed, onGenericNodesChange, onCursorChange,
            } = getNodeTypeProps(this.props, draggingType);
            if (!onGenericNodesChange) {
                return;
            }
            let changedNodes = [];
            let node;
            let object;
            let nextNodes = nodes;
            if (editorDragging.type === 'MOVE' && editorDragging.uids?.length > 1) {
                // add the new nodes into the nodes
                const draggingUids = new Set(editorDragging.uids);
                const draggedNodes = [];
                const addNodes = (nodes) => nodes.forEach((node) => {
                    if (draggingUids.has(node.uid)) {
                        draggedNodes.push(node);
                        return;
                    }

                    if (node.branches) {
                        addNodes(node.branches);
                    }
                    if (node.children) {
                        addNodes(node.children);
                    }
                });
                addNodes(nodes);
                if (!draggedNodes.length) {
                    return;
                }
                const draggingIndex = draggingTo.node ? draggedNodes.findIndex((node) => node.uid === draggingTo.node.uid) : -1;
                if (draggingIndex > 0 && draggingUids.has(draggingTo.node.uid)) {
                    if (draggingTo.position !== POSITION_BEFORE) {
                        return;
                    }
                    nextNodes = replaceNodesDeep(
                        nextNodes,
                        (nodes) => {
                            let changed = false;
                            const nextNodes = nodes.reduce((result, node) => {
                                if (draggingTo.node.uid === node.uid || !draggingUids.has(node.uid)) {
                                    result.push(node);
                                }
                                else {
                                    changed = true;
                                }
                                return result;
                            }, []);
                            return changed ? nextNodes : nodes;
                        },
                    );
                    nextNodes = replaceNodes(
                        nextNodes,
                        (other) => other.uid === draggingTo.node.uid,
                        (nodes, currentNode, index) => [
                            ...nodes.slice(0, index),
                            ...draggedNodes,
                            ...nodes.slice(index + 1),
                        ],
                    );
                    changedNodes = draggedNodes;
                }
                else {
                    if (draggingTo.position === POSITION_END) {
                        nextNodes = replaceNodesDeep(
                            nextNodes,
                            (nodes) => {
                                let changed = false;
                                const nextNodes = nodes.reduce((result, node) => {
                                    if (!draggingUids.has(node.uid)) {
                                        result.push(node);
                                    }
                                    else {
                                        changed = true;
                                    }
                                    return result;
                                }, []);
                                return changed ? nextNodes : nodes;
                            },
                        );
                        nextNodes = [
                            ...nextNodes,
                            ...draggedNodes,
                        ];
                        changedNodes = draggedNodes;
                    }
                    else if (draggingTo.position === POSITION_CHILDREN) {
                        nextNodes = replaceNodesDeep(
                            nextNodes,
                            (nodes) => {
                                let changed = false;
                                const nextNodes = nodes.reduce((result, node) => {
                                    if (!draggingUids.has(node.uid)) {
                                        if (draggingTo.node.uid === node.uid) {
                                            result.push({
                                                ...node,
                                                children: [
                                                    ...node.children,
                                                    ...draggedNodes,
                                                ],
                                            });
                                            changed = true;
                                        }
                                        else {
                                            result.push(node);
                                        }
                                    }
                                    else {
                                        changed = true;
                                    }
                                    return result;
                                }, []);
                                return changed ? nextNodes : nodes;
                            },
                        );
                        changedNodes = draggedNodes;
                    }
                    else if (draggingTo.position === POSITION_BEFORE) {
                        nextNodes = replaceNodesDeep(
                            nextNodes,
                            (nodes) => {
                                let changed = false;
                                const nextNodes = nodes.reduce((result, node) => {
                                    if (draggingTo.node.uid === node.uid) {
                                        result.push(...draggedNodes);
                                        changed = true;
                                    }
                                    if (!draggingUids.has(node.uid)) {
                                        result.push(node);
                                    }
                                    else {
                                        changed = true;
                                    }
                                    return result;
                                }, []);
                                return changed ? nextNodes : nodes;
                            },
                        );
                        changedNodes = draggedNodes;
                    }
                    else {
                        return;
                    }
                }
                node = null;
            }
            else {
                if (editorDragging.type === 'CREATE') {
                    object = commandMap[editorDragging.definitionKey];
                    if (!object) {
                        return;
                    }
                    const createNode = (object) => {
                        const node = {
                            uid: generateUUID(),
                            [commandNameKey]: object.name,
                            packageName: object.packageName,
                            attributes: getDefaultAttributes(object.attributes, iteratorMap, conditionalMap, triggerMap, exceptionMap),
                        };
                        if (object.anchorDefaultValue) {
                            node.anchor = object.anchorDefaultValue;
                        }
                        if (object.returnDefaultValue?.type) {
                            node.returnTo = object.returnDefaultValue;
                        }
                        if (object.nestable) {
                            node.children = [];
                            if (object.defaultChildren?.length > 0) {
                                object.defaultChildren.forEach((defaultChildObject) => {
                                    const defaultObject = commandMap[`${defaultChildObject.packageName || object.packageName}#${defaultChildObject.name}`.toLowerCase()];
                                    if (defaultObject) {
                                        node.children.push(createNode(defaultObject));
                                    }
                                });
                            }
                            else if (object.defaultChild) {
                                const defaultObject = commandMap[`${object.defaultChildPackageName || object.packageName}#${object.defaultChild}`.toLowerCase()];
                                if (defaultObject) {
                                    node.children.push(createNode(defaultObject));
                                }
                            }
                        }
                        if (object.branchable) {
                            node.branches = [];
                            if (object.defaultBranches?.length > 0) {
                                object.defaultBranches.forEach((defaultBranchObject) => {
                                    const defaultObject = commandMap[`${defaultBranchObject.packageName || object.packageName}#${defaultBranchObject.name}`.toLowerCase()];
                                    if (defaultObject) {
                                        const branchObject = Object.entries(defaultBranchObject).reduce((result, [key, value]) => {
                                            if (value) {
                                                result[key] = value;
                                            }
                                            return result;
                                        }, {...defaultObject});
                                        node.branches.push(createNode(branchObject));
                                    }
                                });
                            }
                            else if (object.defaultBranch) {
                                const defaultObject = commandMap[`${object.defaultBranchPackageName || object.packageName}#${object.defaultBranch}`.toLowerCase()];
                                if (defaultObject) {
                                    node.branches.push(createNode(defaultObject));
                                }
                            }
                        }
                        return node;
                    };
                    node = createNode(object);
                    changedNodes = [node];
                    this.setState({newNodeUid: node.uid});
                }
                else if (editorDragging.type === 'MOVE' && editorDragging.uids?.length === 1) {
                    node = getNode(
                        nodes,
                        (node) => node.uid === editorDragging.uids.at(0),
                    );
                    if (!node) {
                        return;
                    }
                    object = node.commandName
                        ? commandMap[getPackageCommandKey(node)]
                        : node.triggerName
                            ? triggerMap[getPackageTriggerKey(node)]
                            : null;
                    nextNodes = replaceNodes(
                        nextNodes,
                        (node) => node.uid === editorDragging.uids.at(0),
                        (nodes, node, index) => [
                            ...nodes.slice(0, index),
                            ...nodes.slice(index + 1),
                        ],
                    );
                    changedNodes = [node];
                }

                if (draggingTo.position === POSITION_END) {
                    if (object?.branchOf) {
                        const lastNode = nextNodes.at(-1);
                        if (!lastNode) {
                            return;
                        }
                        nextNodes = [
                            ...nextNodes.slice(0, -1),
                            {
                                ...lastNode,
                                branches: [
                                    ...lastNode.branches,
                                    node,
                                ],
                            },
                        ];
                        changedNodes = [node];
                    }
                    else {
                        nextNodes = [
                            ...nextNodes,
                            node,
                        ];
                        changedNodes = [node];
                    }
                }
                else if (draggingTo.position === POSITION_BRANCH) {
                    const toCommand = commandMap[`${draggingTo.node.packageName}#${draggingTo.node[commandNameKey]}`.toLowerCase()];
                    if (!toCommand) {
                        return;
                    }
                    if (toCommand.branchable) {
                        nextNodes = replaceNodes(
                            nextNodes,
                            (other) => other.uid === draggingTo.node.uid,
                            (nodes, parentNode) => nodes.map((currentNode) => {
                                if (currentNode !== parentNode) {
                                    return currentNode;
                                }

                                return {
                                    ...parentNode,
                                    branches: [node],
                                };
                            }),
                        );
                        changedNodes = [node];
                    }
                    else if (toCommand.branchOf) {
                        nextNodes = replaceNodes(
                            nextNodes,
                            (parent) => {
                                if (!parent.branches || parent.branches.length === 0) {
                                    return false;
                                }
                                return parent.branches.find((other) => other.uid === draggingTo.node.uid);
                            },
                            (nodes, parentNode) => nodes.map((currentNode) => {
                                if (currentNode !== parentNode) {
                                    return currentNode;
                                }
                                return {
                                    ...parentNode,
                                    branches: [...parentNode.branches, node],
                                };
                            }),
                        );
                        changedNodes = [node];
                    }
                    else {
                        return;
                    }
                }
                else if (draggingTo.position === POSITION_CHILDREN) {
                    if (object?.branchOf) {
                        const toCommand = commandMap[`${draggingTo.node.packageName}#${draggingTo.node[commandNameKey]}`.toLowerCase()];
                        if (!toCommand) {
                            return;
                        }
                        let branchRootNode = null;
                        let branchIndex = -1;
                        if (
                            toCommand.name === object.branchOf &&
                            toCommand.packageName === object.packageName
                        ) {
                            branchRootNode = getNode(nextNodes, (node) => node.uid === draggingTo.node.uid);
                            branchIndex = 0;
                        }
                        else if (
                            toCommand.branchOf === object.branchOf &&
                            toCommand.packageName === object.packageName
                        ) {
                            const context = getNodeContext(nextNodes, (node) => node.uid === draggingTo.node.uid);
                            if (!context?.root) {
                                return;
                            }
                            branchRootNode = context.root;
                            const draggingToIndex = context.root.branches?.findIndex((node) => node.uid === draggingTo.node.uid) ?? -1;
                            if (draggingToIndex === -1) {
                                return;
                            }
                            branchIndex = draggingToIndex + 1;
                        }
                        if (!branchRootNode || branchIndex === -1) {
                            return;
                        }
                        nextNodes = replaceNodes(
                            nextNodes,
                            (other) => other.uid === branchRootNode.uid,
                            (nodes) => {
                                return nodes.map((currentNode) => {
                                    if (currentNode.uid !== branchRootNode.uid) {
                                        return currentNode;
                                    }
                                    return {
                                        ...currentNode,
                                        branches: [
                                            ...currentNode.branches.slice(0, branchIndex),
                                            node,
                                            ...currentNode.branches.slice(branchIndex),
                                        ],
                                    };
                                });
                            },
                        );
                        changedNodes = [node];
                    }
                    else {
                        nextNodes = replaceNodes(
                            nextNodes,
                            (other) => other.uid === draggingTo.node.uid,
                            (nodes, currentNode) => nodes.map((otherNode) => {
                                if (otherNode !== currentNode) {
                                    return otherNode;
                                }
                                return {
                                    ...otherNode,
                                    children: [...currentNode.children, node],
                                };
                            }),
                        );
                        changedNodes = [node];
                    }
                }
                else {
                    if (object?.branchOf) {
                        nextNodes = replaceNodes(
                            nextNodes,
                            (other) => other.uid === draggingTo.node.uid,
                            (nodes, beforeNode, index, isBranch) => {
                                if (isBranch) {
                                    return [
                                        ...nodes.slice(0, index),
                                        node,
                                        ...nodes.slice(index),
                                    ];
                                }
                                const rootNode = nodes[index - 1];
                                if (!rootNode) {
                                    return nodes;
                                }
                                return [
                                    ...nodes.slice(0, index - 1),
                                    {
                                        ...rootNode,
                                        branches: [
                                            ...rootNode.branches,
                                            node,
                                        ],
                                    },
                                    ...nodes.slice(index),
                                ];
                            },
                        );
                        changedNodes = [node];
                    }
                    else {
                        nextNodes = replaceNodes(
                            nextNodes,
                            (other) => other.uid === draggingTo.node.uid,
                            (nodes, currentNode, index) => [
                                ...nodes.slice(0, index),
                                node,
                                ...nodes.slice(index),
                            ],
                        );
                        changedNodes = [node];
                    }
                }
            }
            onGenericNodesChange(nextNodes);
            if (node && onCursorChange) {
                let view = draggingOver;
                if (!view) {
                    view = getAutomationTypeIsProcess(automationType) || collapsed.has(KEY_CANVAS_LIST) ? KEY_CANVAS_FLOW : KEY_CANVAS_LIST;
                }
                onCursorChange({uid: node.uid, view: draggingOver});
            }
            this.setNodesChanged(...changedNodes);
        });
    };

    handleDragOverList = (event, nodeType, doEnd) => {
        this.handleDragOver(event, KEY_CANVAS_LIST, nodeType, doEnd);
    };

    handleDragOverGraph = (event, nodeType, doEnd) => {
        this.handleDragOver(event, KEY_CANVAS_FLOW, nodeType, doEnd);
    };

    handleDragOver = (event, draggingOver, nodeType, doEnd) => {
        const editorDragging = fromLocalStorage('editor-dragging', null);
        if (!editorDragging) {
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'none';
            return;
        }
        event.stopPropagation();
        event.preventDefault();
        clearTimeout(this.dragTimeout);
        this.dragTimeout = setTimeout(() => {
            this.setDragging({draggingTo: null, draggingOver: null});
        }, DELAY_DRAG);
        let nodes;
        let objectMap;
        let objectNameKey;
        if (nodeType === NODE_TYPE_COMMAND) {
            nodes = this.props.nodes;
            objectMap = this.props.commandMap;
            objectNameKey = 'commandName';
        }
        else if (nodeType === NODE_TYPE_TRIGGER) {
            nodes = this.props.triggers;
            objectMap = this.props.triggerMap;
            objectNameKey = 'triggerName';
        }
        else {
            event.dataTransfer.dropEffect = 'none';
            this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
            return;
        }
        let isDraggingBranch = false;
        if (editorDragging.type === 'CREATE') {
            const object = objectMap[editorDragging.definitionKey];
            if (!object || !canAddNodeResult(nodes, object, null, POSITION_CHILDREN, objectMap, objectNameKey, draggingOver)) {
                event.dataTransfer.dropEffect = 'none';
                this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
                return;
            }
            isDraggingBranch = object.branchOf;
            event.dataTransfer.dropEffect = 'copy';
        }
        else if (editorDragging.type && editorDragging.uids?.length === 1) {
            if (!canMoveNodeResult(nodes, editorDragging.uids.at(0), null, POSITION_CHILDREN, objectMap, objectNameKey, draggingOver)) {
                event.dataTransfer.dropEffect = 'none';
                this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
                return;
            }
            const draggingNode = getNode(nodes, (node) => node.uid === editorDragging.uids.at(0));
            if (draggingNode) {
                const object = objectMap[`${draggingNode.packageName}#${draggingNode[objectNameKey]}`.toLowerCase()];
                isDraggingBranch = object?.branchOf;
            }
            event.dataTransfer.dropEffect = 'move';
        }
        else if (editorDragging.type === 'MOVE' && editorDragging.uids?.length > 1) {
            if (!canMoveNodesResult(nodes, editorDragging.uids, null, POSITION_CHILDREN, objectMap, objectNameKey)) {
                event.dataTransfer.dropEffect = 'none';
                this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
                return;
            }
            event.dataTransfer.dropEffect = 'move';
        }
        if (doEnd) {
            let parentUid;
            if (isDraggingBranch) {
                const lastNode = nodes.at(-1);
                if (lastNode) {
                    const lastObject = objectMap[`${lastNode.packageName}#${lastNode[objectNameKey]}`.toLowerCase()];
                    if (lastObject?.branchable) {
                        parentUid = lastNode.uid;
                    }
                }
            }
            this.setDragging({draggingTo: {...DRAGGING_END, parentUid}, draggingOver});
            event.dataTransfer.dropEffect = editorDragging?.type === 'MOVE' ? 'move' : 'copy';
            return;
        }
        event.dataTransfer.dropEffect = 'none';
        this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
    };

    handleDragStart = (draggingType) => {
        this.setDragging({draggingFrom: null, draggingTo: null, draggingOver: null, draggingType: null}, true);
        // This happens next tick, it must happen after the initial state
        this.setDragging({draggingType});
    };

    handleDragEnd = () => {
        clearTimeout(this.dragTimeout);
        this.setDragging({draggingFrom: null, draggingTo: null, draggingOver: null, draggingType: null}, false, true);
    };

    handleNodeDragStart = (event, draggingFrom, draggingOver, draggingType = NODE_TYPE_COMMAND) => {
        this.setDragging({draggingFrom: null, draggingTo: null, draggingOver: null, draggingType: null}, true);
        // This happens next tick, it must happen after the initial state
        this.setDragging({draggingFrom, draggingOver, draggingType});
    };

    handleNodeDragOver = (event, nodeType, node, nodeParent, nodeBefore, nodeAfter, position, draggingOver) => {
        const editorDragging = fromLocalStorage('editor-dragging', null);
        if (!editorDragging) {
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'none';
            return;
        }
        event.stopPropagation();
        event.preventDefault();
        clearTimeout(this.dragTimeout);
        this.dragTimeout = setTimeout(() => {
            this.setDragging({draggingTo: null});
        }, DELAY_DRAG);
        let nodes;
        let objectMap;
        let objectNameKey;
        if (nodeType === NODE_TYPE_COMMAND) {
            nodes = this.props.nodes;
            objectMap = this.props.commandMap;
            objectNameKey = 'commandName';
        }
        else if (nodeType === NODE_TYPE_TRIGGER) {
            nodes = this.props.triggers;
            objectMap = this.props.triggerMap;
            objectNameKey = 'triggerName';
        }
        else {
            event.dataTransfer.dropEffect = 'none';
            return;
        }
        let draggingObject;
        if (editorDragging.type === 'CREATE' && (nodeType === NODE_TYPE_TRIGGER || nodeType === NODE_TYPE_COMMAND)) {
            const object = objectMap[editorDragging.definitionKey];
            if (!object || !canAddNodeResult(nodes, object, node, position, objectMap, objectNameKey, draggingOver)) {
                event.dataTransfer.dropEffect = 'none';
                this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
                return;
            }
            draggingObject = object;
            event.dataTransfer.dropEffect = 'copy';
        }
        else if (editorDragging.type === 'MOVE' && editorDragging.uids?.length === 1) {
            if (!canMoveNodeResult(nodes, editorDragging.uids.at(0), node, position, objectMap, objectNameKey, draggingOver)) {
                event.dataTransfer.dropEffect = 'none';
                this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
                return;
            }
            const draggingNode = getNode(nodes, (node) => node.uid === editorDragging.uids.at(0));
            if (draggingNode) {
                draggingObject = objectMap[`${draggingNode.packageName}#${draggingNode[objectNameKey]}`.toLowerCase()];
            }
            event.dataTransfer.dropEffect = 'move';
        }
        else if (editorDragging.type === 'MOVE' && editorDragging.uids?.length > 1) {
            if (!canMoveNodesResult(nodes, editorDragging.uids, node, position, objectMap, objectNameKey)) {
                event.dataTransfer.dropEffect = 'none';
                this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
                return;
            }
            event.dataTransfer.dropEffect = 'move';
        }
        else {
            event.dataTransfer.dropEffect = 'none';
            this.setDragging({draggingTo: DRAGGING_INVALID, draggingOver});
            return;
        }
        let parentUid = null;
        if (draggingObject) {
            if (draggingObject.branchOf) {
                if (position === POSITION_CHILDREN) {
                    parentUid = node?.children?.at(-1)?.uid;
                }
                else if (position === POSITION_BEFORE) {
                    parentUid = nodeBefore?.uid || nodeParent?.uid;
                }
                else {
                    parentUid = node?.uid;
                }
            }
            else {
                if (position === POSITION_CHILDREN) {
                    parentUid = node?.uid;
                }
                else if (position === POSITION_BEFORE) {
                    parentUid = nodeParent?.uid;
                }
                else {
                    parentUid = node?.uid;
                }
            }
        }
        const draggingTo = {node, parentUid, position};
        this.setDragging({draggingTo, draggingOver});
    };

    handleNodeChange = (node, nodeType) => {
        this.handleApplyNodeDetails(() => {
            const {nodes, orphans, swimlanes, onGenericNodesChange} = getNodeTypeProps(this.props, nodeType);
            if (!node || !onGenericNodesChange) {
                return;
            }
            const {uid} = node;
            const updateNodes = (nodes) => {
                let wasFound = false;
                const nextNodes = replaceNodes(
                    nodes,
                    (currentNode) => currentNode.uid === uid,
                    (nodes) => nodes.map((otherNode) => {
                        if (otherNode.uid !== uid) {
                            return otherNode;
                        }
                        wasFound = true;
                        const nextNode = {...node};
                        if ('branches' in otherNode) {
                            nextNode.branches = otherNode.branches;
                        }
                        if ('children' in otherNode) {
                            nextNode.children = otherNode.children;
                        }
                        return nextNode;
                    }),
                );
                return wasFound ? nextNodes : nodes;
            };
            const nextNodes = updateNodes(nodes);
            if (nodeType === NODE_TYPE_TRIGGER) {
                if (nextNodes !== nodes) {
                    onGenericNodesChange(nextNodes);
                    this.setNodesChanged(node);
                }
                return;
            }
            const nextOrphans = getNextOrphans(orphans, updateNodes);
            const nextSwimlanes = updateNodes(swimlanes);
            if (nextNodes !== nodes || nextOrphans !== orphans || nextSwimlanes !== swimlanes) {
                onGenericNodesChange(nextNodes, {orphans: nextOrphans, swimlanes: nextSwimlanes});
                this.setNodesChanged(node);
            }
        });
    };

    handleNodeCopy = (node, nodeType) => {
        const {automationType, automationReport, onCopy} = this.props;
        const {commandMap, commandNameKey} = getNodeTypeProps(this.props, nodeType);
        if (!node || !onCopy) {
            return;
        }
        const command = commandMap[`${node.packageName}#${node[commandNameKey]}`.toLowerCase()];
        if (!command) {
            return;
        }
        if (automationReport.rootNodeUid === node.uid) {
            return;
        }
        const nextNode = {...node};
        if (getAutomationTypeIsProcess(automationType)) {
            if (nextNode.children?.length > 0) {
                nextNode.children = [];
            }
            if (nextNode.branches?.length > 0) {
                nextNode.branches = [];
            }
        }
        const clipboard = {
            nodeType,
            isSingle: true,
        };
        switch (nodeType) {
            case NODE_TYPE_COMMAND:
                clipboard.nodes = [node];
                break;
            case NODE_TYPE_TRIGGER:
                clipboard.triggers = [node];
                break;
        }
        onCopy(clipboard);
    };

    handleNodeCut = (node, nodeType) => {
        const {onCopy, onGenericNodesChange} = getNodeTypeProps(this.props, nodeType);
        if (!node || !onCopy || !onGenericNodesChange) {
            return;
        }
        this.handleNodeCopy(node, nodeType);
        this.handleNodeDelete(node, nodeType);
    };

    handleNodePaste = (node, nodeType) => {
        this.handleApplyNodeDetails(() => {
            const {automationType, clipboard, commandMap, commandNameKey, nodes, onGenericNodesChange} = getNodeTypeProps(this.props, nodeType);
            if (!node || !clipboard || !onGenericNodesChange) {
                return;
            }
            if (clipboard.isMultiple) {
                this.handleAppendNodes(
                    (clipboard?.nodes?.length > 0 ? clipboard.nodes : clipboard.triggers),
                    {
                        targetUid: node.uid,
                        nodeType,
                        orphans: clipboard.orphans,
                        isPaste: true,
                    },
                );
                return;
            }
            const clipboardNode = (clipboard?.nodes?.length > 0 ? clipboard.nodes : clipboard.triggers)?.at(0);
            if (!clipboardNode) {
                return;
            }
            const command = commandMap[`${clipboardNode.packageName}#${clipboardNode[commandNameKey]}`.toLowerCase()];
            if (!command) {
                return;
            }
            const nextClipboardNode = cloneNode(clipboardNode, [], commandMap, nodeType);
            if (nodeType === NODE_TYPE_TRIGGER) {
                const hasClipboardLayout = clipboardNode?.layout
                    && typeof clipboardNode.layout.x === 'number'
                    && typeof clipboardNode.layout.y === 'number';
                const hasTargetLayout = node?.layout
                    && typeof node.layout.x === 'number'
                    && typeof node.layout.y === 'number';
                const copiedPosition = hasClipboardLayout
                    ? {x: clipboardNode.layout.x, y: clipboardNode.layout.y}
                    : (hasTargetLayout ? {x: node.layout.x, y: node.layout.y} : undefined);
                const pastedPosition = hasTargetLayout
                    ? {x: node.layout.x, y: node.layout.y}
                    : undefined;
                nextClipboardNode.layout = {
                    ...nextClipboardNode.layout,
                    ...(copiedPosition && {copiedPosition}),
                    ...(pastedPosition && {pastedPosition}),
                };
                onGenericNodesChange([
                    ...nodes,
                    nextClipboardNode,
                ]);
                this.setNodesChanged(nextClipboardNode);
                return;
            }
            let isOrphan = false;
            let orphans = null;
            if (getAutomationTypeIsProcess(automationType)) {
                if (!getCanProcessInsertNodes('PASTE', [nextClipboardNode], nodes, orphans, node.uid, commandMap)) {
                    isOrphan = true;
                }
                if (clipboard.orphans?.length > 0) {
                    orphans = clipboard.orphans;
                }
            }
            this.handleAppendCommandNode(command, nextClipboardNode, {appendToNode: node, isOrphan, orphans});
        });
    };

    handleNodeDelete = (node, nodeType) => {
        const {automationReport} = this.props;
        if (automationReport.rootNodeUid === node.uid) {
            return;
        }
        this.handleApplyNodeDetails(() => {
            const {
                commandMap, commandNameKey,
                cursor, onCursorChange,
                nodes, orphans, onGenericNodesChange,
                packageDetails,
            } = getNodeTypeProps(this.props, nodeType);
            if (!node || !onGenericNodesChange) {
                return;
            }
            const newOrphans = [];
            const getNextNodes = (nodes) => replaceNodes(
                nodes,
                (currentNode) => currentNode.uid === node.uid,
                (nodes, node, index, isBranch) => {
                    // For triggers, just remove the node without orphaning others
                    // Triggers are independent and not connected in a flow
                    if (nodeType === NODE_TYPE_TRIGGER) {
                        return [
                            ...nodes.slice(0, index),
                            ...nodes.slice(index + 1),
                        ];
                    }
                    if (getAutomationTypeIsProcess(automationReport.type)) {
                        const command = packageDetails.commandMap[getPackageCommandKey(node)];
                        if (isBranch) {
                            if (command?.branchSplit) {
                                if (node.children?.length > 0) {
                                    newOrphans.push({
                                        nodes: node.children,
                                    });
                                }
                                return [
                                    ...nodes.slice(0, index),
                                    ...nodes.slice(index + 1),
                                ];
                            }
                        }
                        const afterNodes = nodes.slice(index + 1);
                        if (afterNodes.length > 0) {
                            newOrphans.push({
                                nodes: afterNodes,
                            });
                        }
                        if (node.branches?.length > 0) {
                            if (command?.branchesSplitMerge) {
                                node.branches.forEach((branch) => {
                                    newOrphans.push({
                                        nodes: [branch],
                                    });
                                });
                            }
                            else {
                                newOrphans.push({
                                    nodes: node.branches,
                                });
                            }
                        }
                        if (node.children?.length > 0) {
                            newOrphans.push({
                                nodes: node.children,
                            });
                        }
                        return nodes.slice(0, index);
                    }
                    return [
                        ...nodes.slice(0, index),
                        ...nodes.slice(index + 1),
                    ];
                },
            );
            let nextNodes = getNextNodes(nodes);
            let nextOrphans = getNextOrphans(orphans, getNextNodes);
            if (getAutomationTypeIsProcess(automationReport.type)) {
                [nextNodes, nextOrphans] = getNextNodesWithUnlinkedSplitMerge(nextNodes, nextOrphans, packageDetails);
            }
            if (newOrphans.length > 0) {
                nextOrphans = [...nextOrphans, ...newOrphans];
            }
            let nextCursor;
            if (cursor) {
                let cursorNode;
                if (cursor.uid === node.uid || getNode([node], (node) => node.uid === cursor.uid)) {
                    cursorNode = node;
                }
                if (nextNodes.length === 0) {
                    nextCursor = null;
                }
                else if (cursorNode) {
                    const cursorCommand = commandMap[`${cursorNode.packageName}#${cursorNode[commandNameKey]}`.toLowerCase()];
                    if (!cursorCommand) {
                        nextCursor = null;
                    }
                    else {
                        const targetContext = getNodeContext(nodes, (node) => node.uid === cursorNode.uid);
                        if (!targetContext) {
                            nextCursor = null;
                        }
                        else {
                            if (cursorCommand.branchOf) {
                                if (cursorCommand.branchEnd) {
                                    const secondLast = targetContext.nodes[targetContext.nodes.length - 2];
                                    if (secondLast) {
                                        nextCursor = {...cursor, uid: secondLast.uid};
                                    }
                                    else if (targetContext.root) {
                                        nextCursor = {...cursor, uid: targetContext.root.uid};
                                    }
                                }
                                else {
                                    const previous = targetContext.nodes[targetContext.nodes.indexOf(targetContext.node) - 1];
                                    if (previous) {
                                        nextCursor = {...cursor, uid: previous.uid};
                                    }
                                    else if (targetContext.root) {
                                        nextCursor = {...cursor, uid: targetContext.root.uid};
                                    }
                                }
                            }
                            else {
                                const previous = targetContext.nodes[targetContext.nodes.indexOf(targetContext.node) - 1];
                                if (previous) {
                                    nextCursor = {...cursor, uid: previous.uid};
                                }
                                else if (targetContext.nodes.length > 1) {
                                    nextCursor = {...cursor, uid: targetContext.nodes[1].uid};
                                }
                                else if (targetContext.parents.length) {
                                    const parent = targetContext.parents[targetContext.parents.length - 1];
                                    if (parent) {
                                        nextCursor = {...cursor, uid: parent.uid};
                                    }
                                }
                                else if (nextNodes.length) {
                                    nextCursor = {...cursor, uid: nextNodes.at(0).uid};
                                }
                            }
                        }
                    }
                }
            }
            onGenericNodesChange(nextNodes, {orphans: nextOrphans});
            if (nextCursor !== undefined) {
                onCursorChange(nextCursor);
            }
        });
    };

    handleSwimlaneDelete = (swimlaneUid) => {
        this.handleApplyNodeDetails(() => {
            const {
                swimlanes, swimlaneStacking, onNodesChange,
            } = this.props;
            let isFound = false;
            onNodesChange({
                swimlanes: swimlanes.reduce((result, swimlane) => {
                    if (swimlane.uid === swimlaneUid) {
                        isFound = true;
                    }
                    else if (isFound) {
                        const lastSwimlane = result.at(-1);
                        const nextSwimlane = {...swimlane};
                        switch (swimlaneStacking) {
                            case 'TOP_TO_BOTTOM':
                                if (!lastSwimlane) {
                                    nextSwimlane.layout = {
                                        ...nextSwimlane.layout,
                                        y: 0,
                                    };
                                }
                                else {
                                    nextSwimlane.layout = {
                                        ...nextSwimlane.layout,
                                        y: lastSwimlane.layout.y + lastSwimlane.layout.height,
                                    };
                                }
                                break;
                            case 'LEFT_TO_RIGHT':
                                if (!lastSwimlane) {
                                    nextSwimlane.layout = {
                                        ...nextSwimlane.layout,
                                        x: 0,
                                    };
                                }
                                else {
                                    nextSwimlane.layout = {
                                        ...nextSwimlane.layout,
                                        x: lastSwimlane.layout.x + lastSwimlane.layout.width,
                                    };
                                }
                                break;
                        }
                        result.push(nextSwimlane);
                    }
                    else {
                        result.push(swimlane);
                    }
                    return result;
                }, []),
            });
            this.handleCursorClear();
        });
    };

    handleEdgeDelete = (edgeId) => {
        if (!edgeId?.startsWith('e')) {
            return;
        }
        this.handleApplyNodeDetails(() => {
            const {
                cursor,
                packageDetails,
                nodes,
                orphans,
                onNodesChange,
            } = this.props;
            const cursorEdges = getCursorEdges(cursor);
            const [nextNodes, nextOrphans] = getNextNodesAndOrphansWithoutEdges(nodes, orphans, cursorEdges, packageDetails);
            onNodesChange({nodes: nextNodes, orphans: nextOrphans});
            this.handleCursorClear();
        });
    };

    handleNodeSubmit = (node, nodeType) => {
        if (node) {
            const {opened, onOpenedChange} = this.props;
            if (onOpenedChange) {
                onOpenedChange(opened.remove(`node:${node.uid}`).clone());
            }
            this.handleNodeChange(node, nodeType);
        }
        else {
            this.handleCursorClear();
        }
    };

    handleNodeRunFrom = (node) => {
        const {canRun, onRunFromStart} = this.props;
        if (!canRun || !node || !onRunFromStart) {
            return;
        }
        onRunFromStart(node);
    };

    handleCursorChange = (cursor) => {
        const {automationType, triggers, nodes, onCursorChange} = this.props;
        if (!triggers || !nodes || !onCursorChange) {
            return;
        }
        // if we are selecting from uid to a target, trace the path through common parents
        if (cursor?.target && cursor.uid !== cursor.target) {
            const selectedRange = getNodesRange(triggers, nodes, cursor.uid, cursor.target);
            if (selectedRange.length === 0) {
                return;
            }
            const uids = cursor.uids || new CheapSet();
            const addNode = getAutomationTypeHasParentAutoSelect(automationType)
                ? (node) => {
                    uids.add(node.uid);
                    if (node.children) {
                        node.children.forEach(addNode);
                    }
                    if (node.branches) {
                        node.branches.forEach(addNode);
                    }
                }
                : (node) => uids.add(node.uid);
            selectedRange.forEach(addNode);
            uids.remove(cursor.uid);
            if (uids.size === 0) {
                onCursorChange({
                    uid: cursor.uid,
                    view: cursor.view,
                });
                return;
            }
            onCursorChange({
                uid: cursor.uid,
                uids: uids.clone(),
                view: cursor.view,
            });
            return;
        }
        if (!cursor?.uids) {
            onCursorChange(cursor);
            return;
        }
        if (getAutomationTypeHasParentAutoSelect(automationType)) {
            const isCursorNode = (node) => node.uid === cursor.uid || cursor.uids.has(node.uid);
            const addNode = (node) => {
                cursor.uids.add(node.uid);
                if (node.children) {
                    node.children.forEach(addNode);
                }
                if (node.branches) {
                    node.branches.forEach(addNode);
                }
            };
            const checkNodes = (nodes) => {
                if (!nodes) {
                    return;
                }
                nodes.forEach((node) => {
                    if (isCursorNode(node) || (node.branches && node.branches.some(isCursorNode))) {
                        addNode(node);
                        return;
                    }
                    if (node.children) {
                        checkNodes(node.children);
                    }
                    if (node.branches) {
                        checkNodes(node.branches);
                    }
                });
            };
            checkNodes(triggers);
            checkNodes(nodes);
        }
        if (cursor.uids.has(cursor.uid)) {
            cursor.uids.remove(cursor.uid);
        }
        if (cursor.uids.size === 0) {
            onCursorChange({
                uid: cursor.uid,
                view: cursor.view,
            });
            return;
        }
        onCursorChange({
            ...cursor,
            uids: cursor.uids.clone(),
        });
    };

    handleCursorOpen = () => {
        const {cursor, sizes, onResize} = this.props;
        const {newNodeUid, details} = this.state;
        this.timeoutCursorOpen = null;
        let nextNewNodeUid = null;
        let nextDetails = null;
        if (cursor && cursor.uid) {
            if (details && details.uid === cursor.uid) {
                this.setState({detailsDebounced: false});
                return;
            }
            if (newNodeUid && cursor.uid === newNodeUid) {
                nextNewNodeUid = newNodeUid;
            }
            nextDetails = {uid: cursor.uid};
        }
        if (!nextDetails && !details) {
            this.setState({detailsDebounced: false});
            return;
        }
        this.setState({details: nextDetails, detailsDebounced: false, newNodeUid: nextNewNodeUid}, () => {
            if (nextDetails && !details && sizes.get(KEY_DETAILS) === 0) {
                onResize(KEY_DETAILS, SIZE_DETAILS_DEFAULT);
            }
        });
    };

    handleCursorAll = () => {
        const {automationType, triggers, nodes, cursor, onCursorChange, collapsed} = this.props;
        if (!triggers.length && !nodes.length) {
            return;
        }
        const view = cursor?.view || (
            getAutomationTypeIsProcess(automationType) || collapsed.has(KEY_CANVAS_LIST) ? KEY_CANVAS_FLOW : KEY_CANVAS_LIST
        );
        let uid = cursor && cursor.uid;
        const uids = new CheapSet();
        const addNode = (node) => {
            if (!uid) {
                uid = node.uid;
            }
            else {
                uids.add(node.uid);
            }
        };
        forNodes(triggers, addNode);
        forNodes(nodes, addNode);
        if (!uid) {
            return;
        }
        if (uids.size > 0) {
            onCursorChange({uid, uids: uids.clone(), view});
        }
        else {
            onCursorChange({uid, view});
        }
    };

    handleCursorClear = () => {
        const {onCursorChange} = this.props;
        onCursorChange(null);
        clearTimeout(this.timeoutCursorOpen);
        this.timeoutCursorOpen = null;
        this.setState({details: null, detailsDebounced: false, newNodeUid: null});
    };

    handleVariableOpen = (mode, variable, options, callback) => {
        const doOpen = () => {
            const key = `${mode}!${variable?.key ?? generateUUID()}`;
            this.setState({variableDetails: {key, mode, variable, options, callback}});
        };
        if (!options?.noSave) {
            this.handleCheckUnsaved(doOpen);
            return;
        }
        doOpen();
    };

    handleVariableClose = () => {
        const {variableDetails} = this.state;
        if (!variableDetails) {
            return;
        }
        this.setState({variableDetails: null});
    };

    handleVariableSubmit = (nextVariable, previousVariable) => {
        const {variableDetails} = this.state;
        if (!variableDetails) {
            return;
        }

        const {mode, options, callback} = variableDetails;
        this.setState({variableDetails: null}, () => {
            if (!nextVariable) {
                return;
            }

            const applyNodeDetails = !options?.noSave
                ? (handleVariableChange) => this.handleApplyNodeDetails(handleVariableChange)
                : (handleVariableChange) => handleVariableChange();

            applyNodeDetails(() => {
                const {variables, onVariablesChange} = this.props;
                if (onVariablesChange) {
                    if (mode === 'create') {
                        onVariablesChange([...variables, nextVariable]);
                        if (!options?.noSave) {
                            this.handleDelayedSave();
                        }
                    }
                    else if (mode === 'edit') {
                        onVariablesChange(
                            variables.map((other) => (other.key === previousVariable.key) ? nextVariable : other),
                            (previousVariable && nextVariable.name !== previousVariable.name) ? [nextVariable.name, previousVariable.name] : null,
                        );
                        if (!options?.noSave) {
                            this.handleDelayedSave();
                        }
                    }
                }
                if (callback) {
                    callback(nextVariable);
                }
            });
        });
    };

    handleWindowsRequest = () => {
        const {onWindowsRequest} = this.props;
        if (!onWindowsRequest) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onWindowsRequest(recorderPackage);
    };

    handleBrowserTabsRequest = () => {
        const {onBrowserTabsRequest} = this.props;
        if (!onBrowserTabsRequest) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onBrowserTabsRequest(recorderPackage);
    };

    handleFileRequest = (...args) => {
        const {onFileRequest} = this.props;
        if (!onFileRequest) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onFileRequest(recorderPackage, ...args);
    };

    handleOperationButtonRequest = (...args) => {
        const {onOperationButtonRequest} = this.props;
        if (!onOperationButtonRequest) {
            return;
        }


        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onOperationButtonRequest(recorderPackage, ...args);
    };

    handleOperationTreeRequest = (...args) => {
        const {onOperationTreeRequest} = this.props;
        if (!onOperationTreeRequest) {
            return;
        }


        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onOperationTreeRequest(recorderPackage, ...args);
    };

    handleOperationTableRequest = (...args) => {
        const {onOperationTableRequest} = this.props;
        if (!onOperationTableRequest) {
            return;
        }


        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onOperationTableRequest(recorderPackage, ...args);
    };

    handleOperationSelectRequest = (...args) => {
        const {onOperationSelectRequest} = this.props;
        if (!onOperationSelectRequest) {
            return;
        }


        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onOperationSelectRequest(recorderPackage, ...args);
    };

    handleObjectCaptureRequest = (...args) => {
        const {onObjectCaptureRequest} = this.props;
        if (!onObjectCaptureRequest) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onObjectCaptureRequest(recorderPackage, ...args);
    };

    handleAnchorCaptureRequest = (...args) => {
        const {onAnchorCaptureRequest} = this.props;
        if (!onAnchorCaptureRequest) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onAnchorCaptureRequest(recorderPackage, ...args);
    };

    handleImageCaptureRequest = (...args) => {
        const {onImageCaptureRequest} = this.props;
        if (!onImageCaptureRequest) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onImageCaptureRequest(recorderPackage, ...args);
    };

    handleCoordinateCaptureRequest = (...args) => {
        const {onCoordinateCaptureRequest} = this.props;
        if (!onCoordinateCaptureRequest) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onCoordinateCaptureRequest(recorderPackage, ...args);
    };

    handleRegionCaptureRequest = (...args) => {
        const {onRegionCaptureRequest} = this.props;
        if (!onRegionCaptureRequest) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        onRegionCaptureRequest(recorderPackage, ...args);
    };

    handleRecordStart = () => {
        const {onRecorderStart, onNodesChange} = this.props;
        if (!onRecorderStart || !onNodesChange) {
            return;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return;
        }

        this.handleCheckUnsaved(() => {
            onRecorderStart(recorderPackage, (recordingNodes) => {
                this.handleAppendNodes(recordingNodes, {nodeType: NODE_TYPE_COMMAND});
                this.handleDelayedSave();
            });
        });
    };

    handleRecordAISenseStart = () => {
        const {onRecorderStart, onNodesChange} = this.props;
        if (!onRecorderStart || !onNodesChange) {
            return;
        }

        const recorderPackage = this.selectAISensePackage(this.props);
        if (!recorderPackage) {
            return;
        }

        this.handleCheckUnsaved(() => {
            onRecorderStart(recorderPackage, (recordingNodes) => {
                this.handleAppendNodes(recordingNodes, {nodeType: NODE_TYPE_COMMAND});
                this.handleDelayedSave();
            });
        });
    };

    handleFinder = () => {
        if (!this._isMounted) {
            return;
        }

        const {finderHandlers} = this.props;
        if (!finderHandlers.length) {
            return;
        }

        this.handleCheckUnsaved(() => {
            this.setState({finder: {fileHandlers: finderHandlers}});
        });
    };

    handleFinderSubmit = (file, handler) => {
        if (!this._isMounted) {
            return;
        }

        const {commandMap, fileInterfaceMap} = this.props;
        const command = commandMap[handler?.commandKey];
        if (!command) {
            this.setState({finder: null});
            return;
        }

        switch (handler.attributeType) {
            case PACKAGE_ATTRIBUTE_TYPE_AUTOMATION: {
                getFileInterfaceByType(null, file.type, file, (s) => s)
                    .then((fileInterface) => {
                        this.handleAppendCommand(command, {
                            attributeValues: [
                                {
                                    name: handler.attributeName,
                                    value: {
                                        type: VALUE_TYPE_AUTOMATION,
                                        automation: {
                                            file: {
                                                type: VALUE_TYPE_FILE,
                                                string: getRepositoryUri(file.path),
                                            },
                                            variables: fileInterface.variables ?? [],
                                            inputVariables: [],
                                            inputData: fileInterface.inputData ?? [],
                                            previewData: fileInterface.previewData ?? [],
                                        },
                                    },
                                },
                            ],
                        });
                        this.setState({finder: null}, () => {
                            this.handleDelayedSave();
                        });
                    })
                    .catch((error) => this.setState({finder: null, error}));
                break;
            }
            case PACKAGE_ATTRIBUTE_TYPE_TASKBOT: {
                this.setState({finder: null}, () => {
                    this.handleAppendCommand(command, {
                        attributeValues: [
                            {
                                name: handler.attributeName,
                                value: {
                                    type: VALUE_TYPE_TASKBOT,
                                    taskbotFile: {
                                        type: VALUE_TYPE_FILE,
                                        string: getRepositoryUri(file.path),
                                    },
                                    taskbotInput: {
                                        type: VALUE_TYPE_DICTIONARY,
                                        dictionary: [],
                                    },
                                },
                            },
                        ],
                    });
                    if (!fileInterfaceMap[file.path]) {
                        dispatch(getFileInterface(WORKSPACE_PRIVATE, file.path, null, null, () => {
                            this.handleDelayedSave();
                        }));
                    }
                    else {
                        this.handleDelayedSave();
                    }
                });
                break;
            }
        }
    };

    handleFinderCancel = () => {
        if (!this._isMounted) {
            return;
        }

        this.setState({finder: null});
    };

    handleWindowKeyDown = (event) => {
        if (!this._isMounted) {
            return;
        }

        // If a modal is open, that has the current binding context
        let element = this.editorRef.current;
        while (element) {
            if (element.getAttribute('aria-hidden') === 'true') {
                return;
            }
            element = element.parentElement;
        }

        const {
            automationType,
            canRecord, canDebug, canRun,
            mode, cursor, sizes, collapsed,
            nodes,
            debugger: dbugger,
            searchParameters, onSearchParametersChange,
            onRedo, onUndo, onResize, onCursorChange, onCollapsedChange,
            onRecorderStart, onDebuggerStart,
            onDebuggerEnter, onDebuggerPlay, onDebuggerStep, onDebuggerStop,
            onDebuggerStepIn, onDebuggerStepOut,
            onRunStart,
            onAssistantPageOpen,
            onSave,
        } = this.props;
        const key = getEventKey(event);
        const hasNoKey = getEventHasExactModifierKeys(event, {});
        const hasCtrlKey = getEventHasExactModifierKeys(event, {ctrlKey: true});
        const hasCtrlShiftKey = getEventHasExactModifierKeys(event, {ctrlKey: true, shiftKey: true});
        const hasShiftKey = getEventHasExactModifierKeys(event, {shiftKey: true});
        switch (key) {
            case 's':
            case 'S': { // Save
                if (mode !== 'view' && hasCtrlKey && onSave) {
                    event.preventDefault();
                    event.stopPropagation();
                    onSave();
                }
                return;
            }
            case 'r':
            case 'R': { // Start recording
                const recorderPackage = this.selectRecorderPackage(this.props);
                if (mode === 'edit' && hasCtrlShiftKey && canRecord && onRecorderStart && recorderPackage && !recorderPackage.isPackageRestricted) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.handleRecordStart();
                }
                return;
            }
            case 'f':
            case 'F': { // Search bot nodes
                if (hasCtrlShiftKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    let isRootFrame = true;
                    if (dbugger?.botAgentDebugApiVersion > 1 && dbugger?.callstackFrames?.length > 0) {
                        const rootFrame = dbugger.callstackFrames.at(0);
                        isRootFrame = rootFrame.frameUuid === dbugger?.currentCallstackFrameUuid;
                    }
                    if (isRootFrame && onAssistantPageOpen) {
                        onAssistantPageOpen('search');
                    }
                }
                else if (hasCtrlKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (this.searchInputRef.current) {
                        this.searchInputRef.current.focus();
                    }
                    else if (!searchParameters?.type && onSearchParametersChange) {
                        onSearchParametersChange({
                            type: 'quick',
                            canvasLabels: true,
                            nodeValueString: searchParameters?.nodeValueString,
                            nodeValueVariableName: searchParameters?.nodeValueVariableName,
                        });
                    }
                }
                return;
            }
            case 'h':
            case 'H': { // Search bot nodes
                if (hasCtrlKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (mode === 'edit' && onAssistantPageOpen) {
                        onAssistantPageOpen('replace');
                    }
                }
                return;
            }
            case 'F3': // Finder
                event.preventDefault();
                event.stopPropagation();
                if (mode === 'edit') {
                    this.handleFinder();
                }
                return;
            case 'F10': // Exit debugger
                event.preventDefault();
                event.stopPropagation();
                if (onDebuggerEnter && canDebug) {
                    onDebuggerEnter();
                }
                return;
        }

        if (mode === 'debug') {
            const isReady = Boolean(dbugger?.started && dbugger?.ready);
            const isRunning = Boolean(dbugger?.pending);
            const isDone = Boolean(dbugger?.done);

            let isActiveFrameSelected = false;
            if (dbugger?.callstackFrames?.length > 0 && dbugger?.currentCallstackFrameUuid) {
                isActiveFrameSelected = dbugger.currentCallstackFrameUuid === dbugger.callstackFrames.at(-1).frameUuid;
            }

            let canStepIn = false;
            let canStepOut = false;

            if (isReady && !isRunning && dbugger?.botAgentDebugApiVersion >= 3 && isActiveFrameSelected) {
                canStepOut = dbugger?.callstackFrames?.length > 1;
                if (dbugger?.callstackFrames?.length > 0) {
                    canStepIn = dbugger.callstackFrames.at(-1).canStepInto;
                }
            }

            switch (key) {
                case 'F6': { // Play/pause
                    event.preventDefault();
                    event.stopPropagation();
                    if (isReady && !isDone) {
                        if (hasShiftKey && onDebuggerStop) {
                            onDebuggerStop();
                        }
                        else if (hasNoKey && onDebuggerPlay) {
                            onDebuggerPlay();
                        }
                    }
                    return;
                }
                case 'F7': { // Step
                    event.preventDefault();
                    event.stopPropagation();
                    if (!isRunning && isReady && !isDone) {
                        if (hasNoKey && onDebuggerStep) {
                            onDebuggerStep();
                        }
                    }
                    return;
                }
                case 'F8': {
                    event.preventDefault();
                    event.stopPropagation();
                    if (dbugger && !isDone) {
                        if (hasShiftKey && canStepOut && onDebuggerStepOut) {
                            onDebuggerStepOut();
                        }
                        else if (hasNoKey && canStepIn && onDebuggerStepIn) {
                            onDebuggerStepIn();
                        }
                    }
                    return;
                }
            }
        }
        else {
            const isRunning = Boolean(dbugger?.pending);
            switch (key) {
                case 'F5': { // Run
                    event.preventDefault();
                    event.stopPropagation();
                    if (hasNoKey && canRun && onRunStart) {
                        onRunStart();
                    }
                    return;
                }
                case 'F6': { // start debug
                    event.preventDefault();
                    event.stopPropagation();
                    if (hasNoKey && canDebug && !isRunning && onDebuggerStart) {
                        onDebuggerStart(false);
                    }
                    return;
                }
                case 'F7': { // start debug
                    event.preventDefault();
                    event.stopPropagation();
                    if (hasNoKey && canDebug && !isRunning && onDebuggerStart) {
                        onDebuggerStart(true);
                    }
                    return;
                }
            }
        }

        const getIsInput = (element) => {
            const tagName = element?.tagName;
            switch (tagName) {
                case 'INPUT':
                case 'SELECT':
                case 'TEXTAREA':
                    return true;
                case 'DIV':
                    return element.getAttribute?.('contenteditable') === 'true';
                default:
                    return false;
            }
        };
        if (getIsInput(event.target) || getIsInput(document.activeElement)) {
            return;
        }

        // Only respect canvas bindings when a canvas is current in focus
        const activeCanvas = this.selectActiveCanvas(this.props, this.state);
        if (activeCanvas) {
            switch (key) {
                case 'Escape': { // Close details or clear cursor
                    if (sizes && onResize) {
                        const isClosed = sizes && sizes.get(KEY_DETAILS) === 0;
                        if (hasNoKey && !isClosed) {
                            event.preventDefault();
                            event.stopPropagation();
                            onResize(KEY_DETAILS, 0);
                            return;
                        }
                    }

                    if (hasNoKey && cursor && onCursorChange) {
                        event.preventDefault();
                        event.stopPropagation();
                        onCursorChange(null);
                        return;
                    }

                    return;
                }
                case 'Enter': { // Open details if cursor is active
                    if (hasNoKey && cursor) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (sizes && onResize) {
                            const isClosed = sizes && sizes.get(KEY_DETAILS) === 0;
                            if (isClosed) {
                                onResize(KEY_DETAILS, SIZE_DETAILS_DEFAULT);
                            }
                        }
                        clearTimeout(this.enterFocusTimeout);
                        this.enterFocusTimeout = setTimeout(() => {
                            const editor = this.editorRef.current;
                            if (editor) {
                                const element = editor.querySelector('.taskbot-node-details__content [tabindex="0"]');
                                if (element) {
                                    element.focus();
                                }
                            }
                        }, 100);
                        return;
                    }
                    return;
                }
                case ' ': { // Toggle open details
                    if (hasNoKey && sizes && onResize && !getAutomationTypeHasCanvasProcess(automationType)) {
                        event.preventDefault();
                        event.stopPropagation();
                        const isClosed = sizes && sizes.get(KEY_DETAILS) === 0;
                        onResize(KEY_DETAILS, isClosed ? SIZE_DETAILS_DEFAULT : 0);
                    }
                    return;
                }
                case 'a':
                case 'A': { // Select all
                    if (hasCtrlKey && onCursorChange) {
                        event.preventDefault();
                        event.stopPropagation();
                        this.handleCursorAll();
                    }
                    return;
                }
                case ']': { // Expand nodes
                    if (cursor?.uid) {
                        if (onCursorChange && onCollapsedChange) {
                            if (hasCtrlKey) {
                                event.preventDefault();
                                event.stopPropagation();
                                forNodes(nodes, (node) => collapsed.remove(`node:${node.uid}`));
                                onCollapsedChange(collapsed.clone());
                            }
                            else if (hasNoKey) {
                                event.preventDefault();
                                event.stopPropagation();
                                onCollapsedChange(collapsed.remove(`node:${cursor.uid}`).clone());
                            }
                        }
                    }
                    return;
                }
                case '[': { // Collapse nodes
                    if (cursor?.uid) {
                        if (onCursorChange && onCollapsedChange) {
                            if (hasCtrlKey) {
                                event.preventDefault();
                                event.stopPropagation();
                                forNodes(nodes, (node) => collapsed.add(`node:${node.uid}`));
                                onCollapsedChange(collapsed.clone());
                                const [rootNode] = getNodeParents(nodes, cursor.uid);
                                if (rootNode?.uid) {
                                    onCursorChange({...cursor, uid: rootNode.uid});
                                }
                                return;
                            }
                            else if (hasNoKey) {
                                event.preventDefault();
                                event.stopPropagation();
                                onCollapsedChange(collapsed.add(`node:${cursor.uid}`).clone());
                            }
                        }
                    }
                    return;
                }
                case 'F9': { // Toggle breakpoint
                    if (hasShiftKey) {
                        event.preventDefault();
                        event.stopPropagation();
                        this.handleBreakpointsToggle();
                    }
                    else if (hasNoKey && cursor) {
                        event.preventDefault();
                        event.stopPropagation();
                        this.handleBreakpointToggle();
                    }
                    return;
                }
            }
            if (mode === 'edit') {
                let canCopy = Boolean(cursor);
                if (canCopy) {
                    const triggerCount = this.selectCursorTriggerCount(this.props);
                    const commandCount = this.selectCursorCommandCountWithoutRoot(this.props);
                    canCopy = (triggerCount + commandCount) > 0 && (triggerCount > 0) !== (commandCount > 0);
                }
                let canDelete = Boolean(cursor);
                if (canDelete) {
                    const triggerCount = this.selectCursorTriggerCount(this.props);
                    const commandCount = this.selectCursorCommandCountWithoutRoot(this.props);
                    const edgeCount = this.selectCursorEdgeCount(this.props);
                    const swimlaneCount = this.selectCursorSwimlaneCount(this.props);
                    canDelete = swimlaneCount === 1
                        ? (triggerCount + commandCount + edgeCount) === 0
                        : (triggerCount + commandCount + edgeCount) > 0;
                }
                switch (key) {
                    case 'q':
                    case 'Q': {
                        if (hasNoKey && cursor && getAutomationTypeIsTask(automationType)) {
                            event.preventDefault();
                            event.stopPropagation();
                            setTimeout(() => {
                                const editor = this.editorRef.current;
                                if (!editor) {
                                    return;
                                }
                                let canvas;
                                switch (cursor?.view) {
                                    case 'canvas-list':
                                        canvas = editor.querySelector('.taskbot-canvas-list');
                                        break;
                                    case 'canvas-flow':
                                        canvas = editor.querySelector('.taskbot-canvas-flow');
                                        break;
                                }
                                if (!canvas) {
                                    return;
                                }
                                const element = canvas.querySelector(`[data-node-uid="${cursor.uid}"] [data-path="TaskbotNodeQuickAdd"]`);
                                if (!element) {
                                    return;
                                }
                                element.click();
                            }, 0);
                        }
                        return;
                    }
                    case 'Delete': { // Delete node
                        if (hasNoKey && canDelete) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.handleDelete();
                        }
                        return;
                    }
                    case '/': { // Toggle disabled
                        if (hasCtrlKey && cursor && getAutomationTypeHasDisable(automationType)) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.handleDisabledToggle();
                        }
                        return;
                    }
                    case 'c':
                    case 'C': { // Copy node
                        if (hasCtrlKey && canCopy) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.handleCopy();
                        }
                        return;
                    }
                    case 'x':
                    case 'X': { // Cut node
                        if (hasCtrlKey && canCopy) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.handleCut();
                        }
                        return;
                    }
                    case 'v':
                    case 'V': { // Paste node
                        if (hasCtrlKey) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.handlePaste();
                        }
                        return;
                    }
                    case 'y':
                    case 'Y': { // Redo
                        if (hasCtrlKey && onRedo) {
                            event.preventDefault();
                            event.stopPropagation();
                            onRedo();
                        }
                        return;
                    }
                    case 'z':
                    case 'Z': { // Undo
                        if (hasCtrlKey && onUndo) {
                            event.preventDefault();
                            event.stopPropagation();
                            onUndo();
                        }
                        return;
                    }
                }
            }
        }

        // These active duplicates are safe when we are not in an input and are not in the details pane
        const getIsNotInDetails = (element) => !this.detailsRef.current || !element || !(this.detailsRef.current.contains?.(element));
        if (getIsNotInDetails(event.target) && getIsNotInDetails(document.activeElement)) {
            if (mode === 'edit') {
                switch (key) {
                    case 'v':
                    case 'V': { // Paste
                        if (hasCtrlKey) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.handlePaste();
                        }
                        return;
                    }
                    case 'y':
                    case 'Y': { // Redo
                        if (hasCtrlKey && onRedo) {
                            event.preventDefault();
                            event.stopPropagation();
                            onRedo();
                        }
                        return;
                    }
                    case 'z':
                    case 'Z': { // Undo
                        if (hasCtrlKey && onUndo) {
                            event.preventDefault();
                            event.stopPropagation();
                            onUndo();
                        }
                        return;
                    }
                }
            }
        }
    };

    handleQuickAddSuggestionSubmit = (node, suggestedNodes) => {
        const applyChanges = () => this.handleApplyNodeDetails(() => {
            const {commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap} = this.props;
            if (!node?.uid || !(suggestedNodes?.length > 0)) {
                return;
            }
            const replaceNodes = (node) => {
                if (!node) {
                    return null;
                }
                const command = commandMap[getPackageCommandKey(node)];
                if (!command) {
                    return {attributes: [], ...node};
                }
                const nextNode = createNode(command, 'commandName', commandMap, iteratorMap, conditionalMap, triggerMap, exceptionMap);
                if (node.attributes?.length > 0) {
                    const names = new Set(node.attributes.map(({name}) => name));
                    node.attributes = [
                        ...(nextNode.attributes || []).filter(({name}) => !names.has(name)),
                        ...node.attributes,
                    ];
                }
                if (command.nestable && node.children?.length > 0) {
                    nextNode.children = node.children.map(replaceNodes).filter(Boolean);
                }
                if (command.branchable && node.branches?.length > 0) {
                    nextNode.branches = node.branches.map(replaceNodes).filter(Boolean);
                }
                return nextNode;
            };
            this.handleAppendNodes(
                suggestedNodes.map(replaceNodes).filter(Boolean),
                {
                    targetUid: node.uid,
                    nodeType: NODE_TYPE_COMMAND,
                },
            );
        });

        const {commandMap, collapsed, onCollapsedChange} = this.props;
        const command = commandMap[getPackageCommandKey(node)];
        if (command.nestable && collapsed.has(`node:${node.uid}`)) {
            onCollapsedChange(collapsed.remove(`node:${node.uid}`).clone());
            setTimeout(applyChanges, 100);
            return;
        }
        applyChanges();
    };

    setNodesChanged = (...nodes) => {
        if (!this._isMounted) {
            return;
        }

        const uids = new Set();
        forNodes(nodes, (node) => uids.add(node.uid));
        if (!uids.size > 0) {
            return;
        }

        setTimeout(() => {
            if (!this._isMounted) {
                return;
            }

            const changedElements = [];
            const canvasFlow = this.leftCanvasRef.current;
            if (canvasFlow) {
                const elements = canvasFlow.querySelectorAll([...uids].map((uid) => `[data-path="TaskbotCanvasFlowPoint.icon"][data-change-node-uid="${uid}"]`).join(','));
                if (elements) {
                    changedElements.push(...elements);
                }
            }
            const canvasList = this.rightCanvasRef.current;
            if (canvasList) {
                const elements = canvasList.querySelectorAll([...uids].map((uid) => `[data-path="TaskbotCanvasListNode"][data-change-node-uid="${uid}"]`).join(','));
                if (elements) {
                    changedElements.push(...elements);
                }
            }
            if (changedElements.length === 0) {
                return;
            }

            changedElements.forEach((element) => {
                const nodeChanges = (parseInt(element.getAttribute('data-node-changes'), 10) || 0) + 1;
                element.setAttribute('data-node-changes', String(nodeChanges));
            });
            setTimeout(() => {
                if (!this._isMounted) {
                    return;
                }

                changedElements.forEach((element) => {
                    const nodeChanges = (parseInt(element.getAttribute('data-node-changes'), 10) || 0) - 1;
                    if (nodeChanges > 0) {
                        element.setAttribute('data-node-changes', String(nodeChanges));
                    }
                    else {
                        element.removeAttribute('data-node-changes');
                    }
                });
            }, 600);
        }, 50);
    };

    setDragging = (state, isStart = false, isEnd = false) => {
        if (!isStart && !isEnd && this.draggingStates) {
            this.draggingStates.push(state);
            return;
        }

        clearInterval(this.draggingInterval);
        if (!isEnd) {
            this.draggingInterval = setInterval(() => {
                if (this.draggingStates && this.draggingStates.length > 0) {
                    const {draggingFrom, draggingTo, draggingOver, draggingType} = this.state;
                    const state = {draggingFrom, draggingTo, draggingOver, draggingType};
                    for (let i = 0; i < this.draggingStates.length; i++) {
                        Object.assign(state, this.draggingStates[i]);
                    }
                    if (
                        state.draggingFrom !== this.state.draggingFrom ||
                        state.draggingTo !== this.state.draggingTo ||
                        state.draggingOver !== this.state.draggingOver ||
                        state.draggingType !== this.state.draggingType
                    ) {
                        this.setState(state);
                    }
                    this.draggingStates = [];
                    return;
                }

                clearInterval(this.draggingInterval);
                this.draggingInterval = null;
                this.draggingStates = null;
            }, DELAY_UPDATE);
        }
        this.draggingStates = [];
        if (
            state.draggingFrom !== this.state.draggingFrom ||
            state.draggingTo !== this.state.draggingTo ||
            state.draggingOver !== this.state.draggingOver ||
            state.draggingType !== this.state.draggingType
        ) {
            this.setState(state);
        }
    };

    componentDidMount() {
        this._isMounted = true;

        addEventListener(window, 'focus', this.handleWindowFocus, true);
        addEventListener(window, 'pointermove', this.handleWindowPointerMove, true);
        addEventListener(window, 'keydown', this.handleWindowKeyDown, true);

        this.selectCursorChange(this.props);
        this.selectStartBackgroundDesktopSession(this.props);

        if (process.env.NODE_ENV === 'development') {
            // This helps with hot-reloading
            if (window.lastEditorHandleWindowKeyDown) {
                removeEventListener(window, 'keydown', window.lastEditorHandleWindowKeyDown, true);
                window.lastEditorHandleWindowKeyDown = null;
            }
            window.lastEditorHandleWindowKeyDown = this.handleWindowKeyDown;
        }
    }

    componentDidUpdate() {
        this.selectCursorChange(this.props);
        this.selectStartBackgroundDesktopSession(this.props);
    }

    componentWillUnmount() {
        this._isMounted = false;

        clearTimeout(this.dragTimeout);
        clearTimeout(this.enterFocusTimeout);
        clearTimeout(this.timeoutCursorOpen);

        removeEventListener(window, 'focus', this.handleWindowFocus, true);
        removeEventListener(window, 'pointermove', this.handleWindowPointerMove, true);
        removeEventListener(window, 'keydown', this.handleWindowKeyDown, true);

        if (process.env.NODE_ENV === 'development') {
            if (window.lastEditorHandleWindowKeyDown === this.handleWindowKeyDown) {
                window.lastEditorHandleWindowKeyDown = null;
            }
        }
    }

    renderWindowActions() {
        const {
            mode,
            desktop,
            canRecord,
            onWindowsRequest,
            t,
        } = this.props;
        if (mode !== 'edit' || !onWindowsRequest || !canRecord) {
            return null;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return null;
        }

        return (
            <ActionBar theme="info">
                <ActionBar.Action
                    name="refresh-windows"
                    iconName="arrow-circle-clockwise"
                    label={t('taskbot:action-windows-refresh')}
                    loading={Boolean(desktop && (!desktop.ready || desktop.pending))}
                    onClick={this.handleWindowsRequest}
                />
            </ActionBar>
        );
    }

    renderBrowserTabActions() {
        const {
            mode,
            desktop,
            onBrowserTabsRequest,
            t,
        } = this.props;
        if (mode !== 'edit' || !onBrowserTabsRequest) {
            return null;
        }

        const recorderPackage = this.selectRecorderPackage(this.props);
        if (!recorderPackage) {
            return null;
        }

        return (
            <ActionBar theme="info">
                <ActionBar.Action
                    name="refresh-windows"
                    iconName="arrow-circle-clockwise"
                    label={t('taskbot:action-windows-refresh')}
                    loading={Boolean(desktop && (!desktop.ready || desktop.pending))}
                    onClick={this.handleBrowserTabsRequest}
                />
            </ActionBar>
        );
    }

    renderDebug() {
        const {
            mode,
            file,
            debugger: dbugger,
            onDebuggerFrameChange,
            childLoading,
            t,
        } = this.props;
        if (mode !== 'debug' || !dbugger?.started) {
            return null;
        }

        let currentFrame = null;
        const nowDebuggingBotNames = [];
        let activeBotNameAndLineNo = '';

        if (dbugger?.callstackFrames?.length > 0) {
            currentFrame = dbugger.callstackFrames.at(-1);
            dbugger.callstackFrames.forEach((frame) => {
                const filePathParts = unescape(
                    frame.fileUri
                        .replace(/^\w+[:][/]+/, '')
                        .replace(/[?].*$/, ''),
                ).split('/');
                const fileName = filePathParts.at(-1);
                nowDebuggingBotNames.unshift({
                    name: fileName,
                    label: fileName,
                    iconName: 'bot-dots',
                    onClick: () => onDebuggerFrameChange(frame.frameUuid),
                    disabled: frame.frameUuid === dbugger?.currentCallstackFrameUuid,
                });
            });
            if (currentFrame) {
                const lineNumber = t('taskbot:assistant-item-line', {number: currentFrame.lineNumber});
                const fileName = unescape(
                    currentFrame.fileUri
                        .replace(/^\w+[:][/]+/, '')
                        .replace(/[?].*$/, ''),
                ).split('/').at(-1);
                activeBotNameAndLineNo = `${lineNumber} | ${fileName}`;
            }
        }

        return dbugger?.botAgentDebugApiVersion >= 3 && nowDebuggingBotNames.length > 1 ? (
            <div className="taskbot-editor__debug-toolbar">
                {childLoading ? (
                    <div className="taskbot-editor__debug-toolbar-now-loading">
                        <RioSpinner size={16} variant="LOADING"/>
                        <div>{t('taskbot:debug-toolbar-now-loading')}</div>
                    </div>
                ) : currentFrame.frameUuid !== dbugger?.currentCallstackFrameUuid ? (
                    <div className="taskbot-editor__child-debug-toolbar-title">
                        {t('taskbot:debug-toolbar-now-showing')}
                    </div>
                ) : (
                    <div className="taskbot-editor__child-debug-toolbar-title">
                        {t('taskbot:debug-toolbar-now-debugging')}
                    </div>
                )}
                <div className="taskbot-editor__debug-toolbar-bot-names">
                    <IconButton
                        renderDropdown={({hideDropdown}) => (
                            <Dropdown>
                                <Dropdown.Title>{t('taskbot:assistant-debugger-call-stack-title')}</Dropdown.Title>
                                <Dropdown.Divider/>
                                {nowDebuggingBotNames.map((option, index) => (
                                    <Dropdown.Option
                                        key={index}
                                        {...option}
                                        onClose={hideDropdown}
                                    >
                                        {option.label}
                                    </Dropdown.Option>
                                ))}
                            </Dropdown>
                        )}
                    >
                        {file?.name}
                    </IconButton>
                </div>
                {currentFrame.frameUuid !== dbugger?.currentCallstackFrameUuid ? (
                    <div className="taskbot-editor__debug-toolbar-jump-to-label">
                        <RioBadgeStatus sentiment="WARNING" size={16}/>
                        <span>{t('taskbot:debug-toolbar-jump-to-label')}</span>
                        <RioLink
                            className="taskbot-editor__debug-toolbar-jump-to-link"
                            onClick={() => onDebuggerFrameChange(currentFrame?.frameUuid)}
                        >
                            {activeBotNameAndLineNo}
                        </RioLink>
                    </div>
                ) : null}
            </div>
        ) : (
            <>
                <div className="taskbot-editor__debug-toolbar-title">
                    {t('taskbot:debug-toolbar-now-debugging')}:
                </div>
                <div className="taskbot-editor__debug-toolbar-filename">
                    {file?.name || t('label-empty')}
                </div>
            </>
        );
    }

    renderToolbar() {
        const {
            mode,
            cursor,
            clipboard,
            automationType,
            finderHandlers,
            searchParameters, onSearchParametersChange,
            undo, redo,
            collapsed,
            breakpoints, onBreakpointsChange,
            onUndo, onRedo,
            onCopy,
            onGlobalCopy, onGlobalPaste,
            onNodesChange,
            onRecorderStart,
            desktop, debugger: dbugger,
            canDebug, canRecord,
            t,
        } = this.props;
        const actions = [];
        const addAction = (props) => {
            actions.push(
                <ActionBar.Action
                    key={props.name || actions.length}
                    {...props}
                    className={classnames('taskbot-editor__toolbar__action', props.className)}
                />,
            );
        };
        const addSeparator = () => {
            actions.push(
                <ActionBar.Separator key={actions.length}/>,
            );
        };

        const recorderPackage = canRecord && this.selectRecorderPackage(this.props);
        if (mode === 'edit' && onRecorderStart && recorderPackage && !recorderPackage.isPackageRestricted) {
            addAction({
                className: 'taskbot-editor__toolbar__action taskbot-editor__toolbar__action--large',
                name: 'recorder-record',
                aa: 'action-record--fill',
                circle: true,
                label: t('taskbot:action-toolbar-record'),
                keyBinding: getKeyBinding('R', {shiftKey: true, ctrlKey: true}),
                onClick: !desktop || !desktop.pending ? this.handleRecordStart : null,
            });
            addSeparator();
        }

        if (mode === 'debug' && canDebug) {
            const {
                onDebuggerStart, onDebuggerStop,
                onDebuggerPlay, onDebuggerStep,
                onDebuggerStepIn, onDebuggerStepOut,
            } = this.props;
            const isReady = Boolean(dbugger?.started && dbugger?.ready);
            const isRunning = Boolean(dbugger?.pending);
            const isDone = Boolean(dbugger?.done);

            let isActiveFrameSelected = false;
            if (dbugger?.callstackFrames?.length > 0 && dbugger?.currentCallstackFrameUuid) {
                isActiveFrameSelected = dbugger.currentCallstackFrameUuid === dbugger.callstackFrames.at(-1).frameUuid;
            }

            if (isDone) {
                addAction({
                    name: 'debug-play',
                    iconName: 'play-triangle',
                    label: t('taskbot:action-toolbar-debug-continue'),
                    keyBinding: getKeyBinding('F6'),
                    onClick: !onDebuggerPlay ? null : () => onDebuggerStart(false),
                });
            }
            else if (!isRunning) {
                const canPlay = isReady && onDebuggerPlay && (dbugger?.botAgentDebugApiVersion >= 3 ? isActiveFrameSelected : true);
                addAction({
                    name: 'debug-play',
                    iconName: 'play-triangle',
                    label: t('taskbot:action-toolbar-debug-continue'),
                    keyBinding: getKeyBinding('F6'),
                    onClick: !isReady || !onDebuggerPlay ? null : onDebuggerPlay,
                    disabled: !canPlay,
                });
            }
            else {
                addAction({
                    name: 'debug-play',
                    iconName: 'play-triangle',
                    label: t('taskbot:action-toolbar-debug-continue'),
                    onClick: null,
                });
            }
            if (isDone) {
                addAction({
                    name: 'debug-step-over',
                    iconName: 'debug-arrow-step-over',
                    label: t('taskbot:action-toolbar-debug-step-over'),
                    keyBinding: getKeyBinding('F7'),
                    onClick: !onDebuggerStart ? null : () => onDebuggerStart(true),
                });
            }
            else {
                const canStepOver = isReady && !isRunning && onDebuggerStep && (dbugger?.botAgentDebugApiVersion >= 3 ? isActiveFrameSelected : true);
                addAction({
                    name: 'debug-step-over',
                    iconName: 'debug-arrow-step-over',
                    label: t('taskbot:action-toolbar-debug-step-over'),
                    keyBinding: getKeyBinding('F7'),
                    onClick: !isReady || isRunning || !onDebuggerStep ? null : () => onDebuggerStep(true),
                    disabled: !canStepOver,
                });
            }
            if (dbugger?.botAgentDebugApiVersion >= 3) {
                let canStepIn = false;
                let canStepOut = false;

                if (isReady && !isRunning && isActiveFrameSelected) {
                    canStepOut = dbugger?.callstackFrames?.length > 1;
                    if (dbugger?.callstackFrames?.length > 0) {
                        canStepIn = dbugger.callstackFrames.at(-1).canStepInto;
                    }
                }
                addAction({
                    name: 'debug-step-in',
                    iconName: 'debug-arrow-step-in',
                    label: t('taskbot:action-toolbar-debug-step-in'),
                    keyBinding: getKeyBinding('F8'),
                    onClick: !isReady || isRunning || !onDebuggerStepIn ? null : () => onDebuggerStepIn(),
                    disabled: !canStepIn,
                });
                addAction({
                    name: 'debug-step-out',
                    iconName: 'debug-arrow-step-out',
                    label: t('taskbot:action-toolbar-debug-step-out'),
                    keyBinding: getKeyBinding('F8', {shiftKey: true}),
                    onClick: !isReady || isRunning || !onDebuggerStepOut ? null : () => onDebuggerStepOut(),
                    disabled: !canStepOut,
                });
            }
            addAction({
                name: 'debug-stop',
                iconName: 'square',
                label: t('taskbot:action-toolbar-debug-stop'),
                keyBinding: getKeyBinding('F6', {shiftKey: true}),
                onClick: isDone || !onDebuggerStop ? null : onDebuggerStop,
            });
            addSeparator();
        }
        if (mode === 'edit' && finderHandlers.length > 0) {
            addAction({
                name: 'finder',
                aa: 'action-find',
                label: t('taskbot:action-toolbar-finder'),
                keyBinding: getKeyBinding('F3'),
                onClick: this.handleFinder,
            });
        }
        if (onSearchParametersChange) {
            addAction({
                ref: this.searchRef,
                name: 'search',
                aa: 'misc-search-filter-search',
                label: t('taskbot:action-toolbar-search'),
                keyBinding: getKeyBinding('F', {ctrlKey: true}),
                selected: searchParameters?.type === 'quick',
                onClick: !searchParameters?.type || searchParameters?.type === 'quick' ? this.handleSearchToggle : null,
            });
        }
        addSeparator();
        if (mode === 'edit' && (onUndo || onRedo)) {
            addAction({
                name: 'undo',
                aa: 'action-undo',
                label: getTaskbotUndoLabel(t, undo?.at(0)?.type, automationType),
                keyBinding: getKeyBinding('Z', {ctrlKey: true}),
                onClick: onUndo && undo?.length > 0 ? onUndo : null,
            });
            addAction({
                name: 'redo',
                aa: 'action-redo',
                label: getTaskbotRedoLabel(t, redo?.at(0)?.type, automationType),
                keyBinding: getKeyBinding('Y', {ctrlKey: true}),
                onClick: onRedo && redo?.length > 0 ? onRedo : null,
            });
            addSeparator();
        }
        if (mode === 'edit' && onCopy) {
            let canCopy = Boolean(cursor);
            if (canCopy) {
                const triggerCount = this.selectCursorTriggerCount(this.props);
                const commandCount = this.selectCursorCommandCountWithoutRoot(this.props);
                canCopy = (triggerCount + commandCount) > 0 && (triggerCount > 0) !== (commandCount > 0);
            }
            addAction({
                name: 'copy',
                aa: 'action-clipboard-copy',
                label: t('taskbot:action-toolbar-copy'),
                keyBinding: getKeyBinding('C', {ctrlKey: true}),
                onClick: canCopy ? this.handleCopy : null,
            });
            addAction({
                name: 'cut',
                aa: 'action-clipboard-cut',
                label: t('taskbot:action-toolbar-cut'),
                keyBinding: getKeyBinding('X', {ctrlKey: true}),
                onClick: canCopy ? this.handleCut : null,
            });
            addAction({
                name: 'paste',
                aa: 'action-clipboard-paste',
                label: t('taskbot:action-toolbar-paste'),
                keyBinding: getKeyBinding('V', {ctrlKey: true}),
                onClick: onNodesChange && clipboard ? this.handlePaste : null,
            });
        }
        if (mode === 'edit' && onNodesChange) {
            const triggerCount = this.selectCursorTriggerCount(this.props);
            const commandCount = this.selectCursorCommandCountWithoutRoot(this.props);
            const edgeCount = this.selectCursorEdgeCount(this.props);
            const swimlaneChildCount = this.selectCursorSwimlaneChildCount(this.props);
            addAction({
                name: 'multiple-delete',
                theme: 'error',
                label: t('taskbot:action-toolbar-delete'),
                iconName: 'close-x',
                keyBinding: getKeyBinding('Delete'),
                onClick: triggerCount || commandCount || edgeCount || swimlaneChildCount === 0
                    ? this.handleMultipleDelete
                    : null,
            });
            if (getAutomationTypeIsProcess(automationType)) {
                addSeparator();
                const {swimlanes} = this.props;
                if (!swimlanes?.length) {
                    addAction({
                        name: 'swimlane-start',
                        iconName: 'swimlane',
                        label: t('taskbot:action-toolbar-swimlane-start'),
                        onClick: () => {
                            this.setState({addSwimlanes: {swimlaneStacking: 'TOP_TO_BOTTOM'}});
                        },
                    });
                }
                else {
                    addAction({
                        name: 'swimlane-append',
                        iconName: 'swimlane--plus',
                        label: t('taskbot:action-toolbar-swimlane-append'),
                        onClick: () => {
                            const {
                                cursor,
                                swimlanes,
                                commandMap,
                                iteratorMap,
                                conditionalMap,
                                triggerMap,
                                exceptionMap,
                                onNodesChange,
                                onCursorChange,
                            } = this.props;
                            const command = commandMap['swimlane#swimlane'];
                            const cursorSwimlane = cursor?.uid && swimlanes.find((swimlane) => swimlane.uid === cursor.uid);
                            const lastSwimlane = swimlanes.at(-1);
                            const newSwimlane = {
                                uid: generateUUID(),
                                commandName: 'Swimlane',
                                packageName: 'Swimlane',
                                attributes: command
                                    ? getDefaultAttributes(command.attributes, iteratorMap, conditionalMap, triggerMap, exceptionMap)
                                    : [],
                                layout: {
                                    initialNodeId: cursorSwimlane?.uid || lastSwimlane?.uid,
                                },
                            };
                            onNodesChange({swimlanes: [...swimlanes, newSwimlane]});
                            onCursorChange({uid: newSwimlane.uid, view: KEY_CANVAS_FLOW});
                            this.setState({newNodeUid: newSwimlane.uid});
                            this.setNodesChanged(newSwimlane);
                        },
                    });
                    addAction({
                        name: 'swimlane-stop',
                        iconName: 'swimlane--line-through',
                        label: t('taskbot:action-toolbar-swimlane-stop'),
                        onClick: () => {
                            const {nodes, orphans, triggers, onNodesChange} = this.props;
                            const swimlaneMap = new Map();
                            swimlanes?.forEach((swimlane) => swimlaneMap.set(swimlane.uid, swimlane));
                            const getNodesWithoutSwimlanes = (nodes) =>
                                replaceNodesDeep(nodes, (nodes) => nodes.map((node) => {
                                    const lastLayout = node.layout || {};
                                    const swimlane = swimlaneMap.get(lastLayout.swimlaneUid);
                                    return {
                                        ...node,
                                        layout: {
                                            ...lastLayout,
                                            y: (lastLayout.y || 0) + (swimlane?.layout?.y || 0),
                                            x: (lastLayout.x || 0) + (swimlane?.layout?.x || 0),
                                            swimlaneUid: null,
                                        },
                                    };
                                }));
                            const nextNodes = getNodesWithoutSwimlanes(nodes);
                            const nextOrphans = getNextOrphans(orphans, getNodesWithoutSwimlanes);
                            const nextTriggers = triggers.map((trigger) => {
                                const lastLayout = trigger.layout || {};
                                const swimlane = swimlaneMap.get(lastLayout.swimlaneUid);
                                return {
                                    ...trigger,
                                    layout: {
                                        ...lastLayout,
                                        y: (lastLayout.y || 0) + (swimlane?.layout?.y || 0),
                                        x: (lastLayout.x || 0) + (swimlane?.layout?.x || 0),
                                        swimlaneUid: null,
                                    },
                                };
                            });
                            onNodesChange({nodes: nextNodes, orphans: nextOrphans, triggers: nextTriggers, swimlanes: []});
                        },
                    });
                }
            }
        }
        addSeparator();
        if (mode !== 'debug' && (onGlobalCopy || onGlobalPaste)) {
            if (onGlobalCopy) {
                let canCopy = Boolean(cursor);
                if (canCopy) {
                    if (cursor.uids?.size > 0) {
                        const triggerCount = this.selectCursorTriggerCount(this.props);
                        const commandCount = this.selectCursorCommandCountWithoutRoot(this.props);
                        canCopy = !(triggerCount > 0 && commandCount > 0);
                    }
                    else {
                        const object = this.selectCursorObject(this.props);
                        if (!object || object.branchOf) {
                            canCopy = false;
                        }
                    }
                }
                addAction({
                    name: 'shared-clipboard-copy',
                    aa: 'action-clipboard-copy--shared',
                    label: t('taskbot:action-toolbar-shared-clipboard-copy'),
                    onClick: canCopy ? this.handleGlobalCopy : null,
                });
            }
            if (onGlobalPaste) {
                const {hasGlobalClipboard} = this.props;
                addAction({
                    name: 'shared-clipboard-paste',
                    aa: 'action-clipboard-paste--shared',
                    label: t('taskbot:action-toolbar-shared-clipboard-paste'),
                    onClick: hasGlobalClipboard ? this.handleGlobalPaste : null,
                });
            }
            addSeparator();
        }
        if (onBreakpointsChange) {
            addAction({
                name: 'breakpoints-clear',
                aa: 'misc-breakpoint-clear',
                label: t('taskbot:action-toolbar-breakpoints-clear'),
                keyBinding: getKeyBinding('F9', {shiftKey: true}),
                onClick: breakpoints.length ? this.handleBreakpointsClear : null,
            });
            addSeparator();
        }

        const hasFlow = !collapsed.has(KEY_CANVAS_FLOW);
        const hasList = !collapsed.has(KEY_CANVAS_LIST);
        const {editorSize} = this.state;
        const hasCanvasFlow = getAutomationTypeHasCanvasFlow(automationType);
        const hasCanvasList = getAutomationTypeHasCanvasList(automationType);
        return (
            <div className="taskbot-editor__toolbar">
                <ActionBar className="taskbot-editor__toolbar__actions g-override" theme="info" separators={false}>
                    {actions}
                </ActionBar>
                <div className="taskbot-editor__toolbar__spacer"/>
                <div className="taskbot-editor__toolbar__tabs">
                    {hasCanvasFlow && hasCanvasList ? (
                        <EditorTabs
                            active={hasFlow && hasList ? 'both' : hasList ? 'list' : 'flow'}
                            onActive={this.handleCanvasChange}
                            tabs={editorSize === 'lg' || editorSize === 'xl' ? [
                                {name: 'flow', label: t('taskbot:toggle-design-view-title')},
                                {name: 'list', label: t('taskbot:toggle-code-view-title')},
                                {name: 'both', label: t('taskbot:toggle-both-view-title')},
                            ] : [
                                {name: 'flow', label: t('taskbot:toggle-design-view-title')},
                                {name: 'list', label: t('taskbot:toggle-code-view-title')},
                            ]}
                            toolbar
                        />
                    ) : null}
                </div>
            </div>
        );
    }

    renderPalette() {
        const {
            mode,
            packages,
            triggerGroups,
            commandGroups,
            collapsed,
        } = this.props;
        const sections = [];
        sections.push({
            name: KEY_PALETTE_VARIABLES,
            render: (props) => {
                const {
                    mode,
                    automationType,
                    packageMap,
                    sessionTypes,
                    variableGroups,
                    variableMap,
                    variables,
                    onVariablesChange,
                    getUnusedVariables,
                    onGlobalCopy,
                    desktop,
                    debugger: dbugger,
                    groups,
                    onGroupsChange,
                    t,
                } = this.props;
                return (
                    <TaskbotVariableManager
                        mode={mode}
                        automationType={automationType}
                        active={props?.active ?? true}
                        onActive={props?.onActive}
                        packageMap={packageMap}
                        variableGroups={variableGroups}
                        variableMap={variableMap}
                        variables={variables}
                        sessionTypes={sessionTypes}
                        onVariablesChange={onVariablesChange}
                        onVariableOpen={this.handleVariableOpen}
                        onGlobalCopyVariables={onGlobalCopy ? this.handleGlobalCopyVariables : null}
                        onCheckUnsaved={this.handleCheckUnsaved}
                        onDelayedSave={this.handleDelayedSave}
                        getUnusedVariables={getUnusedVariables}
                        debugger={mode === 'debug' && dbugger || null}
                        groups={groups}
                        onGroupsChange={onGroupsChange}
                        desktop={desktop}
                        onFileRequest={this.handleFileRequest}
                        t={t}
                    />
                );
            },
        });
        let active = !collapsed.has(KEY_PALETTE_VARIABLES) ? KEY_PALETTE_VARIABLES : '';
        if (mode === 'edit' && packages?.length) {
            if (commandGroups?.length > 0) {
                sections.push({
                    name: KEY_PALETTE_ACTIONS,
                    render: ({active, onActive}) => {
                        const {
                            mode,
                            automationType,
                            packageMap,
                            commandGroups,
                            commandMap,
                            groups, onGroupsChange,
                            hasFeatureBotstore,
                            controlRoomVersion,
                            hasProcessCodeVersion0,
                            t,
                        } = this.props;
                        return (
                            <TaskbotItemPalette
                                automationType={automationType}
                                type={NODE_TYPE_COMMAND}
                                mode={mode}
                                active={active}
                                onActive={onActive}
                                itemGroups={commandGroups}
                                itemMap={commandMap}
                                packageMap={packageMap}
                                groups={groups}
                                actions={hasFeatureBotstore && automationType === FILE_TYPE_TASKBOT ? (
                                    <ActionBar>
                                        <ActionBar.Action
                                            id="taskbot-botstore-button"
                                            aa="action-botstore"
                                            label={t('taskbot:actions-botstore-label')}
                                            onClick={this.handleBotStoreLink}
                                        />
                                    </ActionBar>
                                ) : null}
                                onGroupsChange={onGroupsChange}
                                onAppendItem={this.handleAppendCommand}
                                onDragStart={mode === 'edit' ? this.handleDragStart : null}
                                onDragEnd={mode === 'edit' ? this.handleDragEnd : null}
                                dragSourceRef={this.dragSourceRef}
                                controlRoomVersion={controlRoomVersion}
                                hasProcessCodeVersion0={hasProcessCodeVersion0}
                                t={t}
                            />
                        );
                    },
                });
                if (!active && !collapsed.has(KEY_PALETTE_ACTIONS)) {
                    active = KEY_PALETTE_ACTIONS;
                }
            }
            if (triggerGroups?.length > 0) {
                sections.push({
                    name: KEY_PALETTE_TRIGGERS,
                    render: ({active, onActive}) => {
                        const {
                            mode,
                            automationType,
                            packageMap,
                            triggerGroups,
                            triggerMap,
                            groups, onGroupsChange,
                            controlRoomVersion,
                            hasProcessCodeVersion0,
                            t,
                        } = this.props;
                        return (
                            <TaskbotItemPalette
                                automationType={automationType}
                                type={NODE_TYPE_TRIGGER}
                                mode={mode}
                                active={active}
                                onActive={onActive}
                                itemGroups={triggerGroups}
                                itemMap={triggerMap}
                                packageMap={packageMap}
                                groups={groups}
                                onGroupsChange={onGroupsChange}
                                onAppendItem={this.handleAppendTriggerNode}
                                onDragStart={mode === 'edit' ? this.handleDragStart : null}
                                onDragEnd={mode === 'edit' ? this.handleDragEnd : null}
                                dragSourceRef={this.dragSourceRef}
                                controlRoomVersion={controlRoomVersion}
                                hasProcessCodeVersion0={hasProcessCodeVersion0}
                                t={t}
                            />
                        );
                    },
                });
                if (!active && !collapsed.has(KEY_PALETTE_TRIGGERS)) {
                    active = KEY_PALETTE_TRIGGERS;
                }
            }
        }
        return (
            <ErrorBoundary>
                <EditorPalette
                    active={active}
                    onActive={this.handlePaletteActive}
                    sections={sections}
                />
            </ErrorBoundary>
        );
    }

    renderFlow({activeCanvas, hasCanvasFlow, hasCanvasList}) {
        const {
            mode,
            loading,
            workspaceName,
            searchParameters,
            searchResults,
            automationType,
            automationReport,
            fileInterfaceMap,
            debugger: dbugger,
            clipboard,
            sizes,
            onResize,
            triggers,
            nodes,
            orphans,
            swimlanes,
            swimlaneStacking,
            onNodesChange,
            packageMap,
            triggerMap,
            triggerGroups,
            iteratorGroups,
            iteratorMap,
            conditionalGroups,
            conditionalMap,
            exceptionGroups,
            exceptionMap,
            commandGroups,
            commandMap,
            commandProperties,
            globalValues,
            taskAliases,
            variableGroups,
            variableMap,
            variables,
            breakpoints,
            onBreakpointsChange,
            opened,
            onOpenedChange,
            collapsed,
            onCollapsedChange,
            cursor,
            onCursorChange,
            panZoom,
            onPanZoomChange,
            canRun,
            hasEditorSettingSuggestNextActions,
            hasFeatureTaskbotGptSuggestions,
            hasProcessCodeVersion0,
            t,
        } = this.props;
        if (!hasCanvasFlow) {
            return null;
        }

        if (collapsed.has(KEY_CANVAS_FLOW) && hasCanvasList) {
            return null;
        }

        const {draggingOver, draggingFrom, draggingTo, draggingType, newNodeUid} = this.state;
        const CanvasComponent = getAutomationTypeHasCanvasProcess(automationType)
            ? TaskbotCanvasProcess
            : TaskbotCanvasFlow;
        return (
            <ErrorBoundary>
                <CanvasComponent
                    key={CanvasComponent.displayName}
                    mode={mode}
                    dragSourceRef={this.dragSourceRef}
                    active={activeCanvas === EditorLayout.LEFT_CANVAS}
                    loading={loading}
                    workspaceName={workspaceName}
                    searchResults={searchParameters?.type ? searchResults : null}
                    automationType={automationType}
                    automationReport={automationReport}
                    fileInterfaceMap={fileInterfaceMap}
                    globalValues={globalValues}
                    taskAliases={taskAliases}
                    debugger={dbugger}
                    clipboard={clipboard}
                    packageMap={packageMap}
                    triggerMap={triggerMap}
                    triggerGroups={triggerGroups}
                    commandGroups={commandGroups}
                    commandMap={commandMap}
                    commandProperties={commandProperties}
                    iteratorGroups={iteratorGroups}
                    iteratorMap={iteratorMap}
                    conditionalGroups={conditionalGroups}
                    conditionalMap={conditionalMap}
                    exceptionGroups={exceptionGroups}
                    exceptionMap={exceptionMap}
                    variableGroups={variableGroups}
                    variableMap={variableMap}
                    variables={variables}
                    breakpoints={breakpoints}
                    onBreakpointsChange={onBreakpointsChange}
                    triggers={triggers}
                    nodes={nodes}
                    orphans={orphans}
                    swimlanes={swimlanes}
                    swimlaneStacking={swimlaneStacking}
                    onNodeChange={onNodesChange ? this.handleNodeChange : null}
                    onNodesChange={onNodesChange}
                    onAppendItem={this.handleAppendCommand}
                    cursor={cursor}
                    onCursorChange={onCursorChange ? this.handleCursorChange : null}
                    collapsed={collapsed}
                    onCollapsedChange={onCollapsedChange}
                    opened={opened}
                    onOpenedChange={onOpenedChange}
                    sizes={sizes}
                    onResize={onResize}
                    panZoom={panZoom}
                    onPanZoomChange={onPanZoomChange}
                    draggingOver={draggingOver}
                    draggingFrom={draggingFrom}
                    draggingTo={draggingTo}
                    draggingType={draggingType}
                    onDragOver={mode === 'edit' ? this.handleDragOverGraph : null}
                    onDrop={mode === 'edit' ? this.handleDrop : null}
                    onNodeDragStart={mode === 'edit' ? this.handleNodeDragStart : null}
                    onNodeDragEnd={mode === 'edit' ? this.handleDragEnd : null}
                    onNodeDragOver={mode === 'edit' ? this.handleNodeDragOver : null}
                    onNodeCopy={mode === 'edit' ? this.handleNodeCopy : null}
                    onNodeCut={mode === 'edit' ? this.handleNodeCut : null}
                    onNodePaste={mode === 'edit' ? this.handleNodePaste : null}
                    onNodeDelete={mode === 'edit' ? this.handleNodeDelete : null}
                    onAppendCommand={mode === 'edit' ? this.handleAppendCommand : null}
                    onAppendTrigger={mode === 'edit' ? this.handleAppendTriggerNode : null}
                    onNodeRunFrom={canRun ? this.handleNodeRunFrom : null}
                    onAddSuggestions={mode === 'edit' && hasFeatureTaskbotGptSuggestions && hasEditorSettingSuggestNextActions
                        ? this.handleQuickAddSuggestionSubmit : null}
                    newNodeUid={newNodeUid}
                    nodeMetrics={this.selectNodeMetrics(this.props)}
                    hasProcessCodeVersion0={hasProcessCodeVersion0}
                    t={t}
                />
                <div
                    onFocus={() => this.handleCanvasFocus(KEY_CANVAS_FLOW)}
                    tabIndex={(triggers?.length > 0 || nodes?.length > 0) && cursor?.view !== KEY_CANVAS_FLOW ? 0 : -1}
                />
            </ErrorBoundary>
        );
    }

    renderList({activeCanvas, hasCanvasFlow, hasCanvasList, isPrinting}) {
        const {
            mode: modeProp,
            loading,
            workspaceName,
            searchParameters: searchParametersProp, searchResults: searchResultsProp,
            automationType, automationReport,
            fileInterfaceMap,
            debugger: debuggerProp,
            clipboard,
            sizes, onResize,
            triggers, nodes, onNodesChange,
            packageMap,
            triggerGroups, triggerMap,
            iteratorGroups, iteratorMap,
            conditionalGroups, conditionalMap,
            exceptionGroups, exceptionMap,
            commandMap, commandProperties,
            globalValues, taskAliases,
            variableGroups, variableMap,
            variables,
            breakpoints, onBreakpointsChange,
            opened, onOpenedChange,
            collapsed, onCollapsedChange,
            cursor: cursorProp, onCursorChange,
            onCopy,
            canRun,
            hasEditorSettingSuggestNextActions,
            hasFeatureTaskbotGptSuggestions,
            commandGroups,
            t,
        } = this.props;
        if (!hasCanvasList) {
            return null;
        }

        if (!isPrinting && hasCanvasFlow && collapsed.has(KEY_CANVAS_LIST)) {
            return null;
        }

        const mode = isPrinting ? 'view' : modeProp;
        const cursor = isPrinting ? null : cursorProp;
        const dbugger = isPrinting ? null : debuggerProp;
        const searchParameters = isPrinting ? null : searchParametersProp;
        const searchResults = isPrinting ? null : searchResultsProp;

        const {draggingOver, draggingFrom, draggingTo, draggingType, newNodeUid} = this.state;
        return (
            <ErrorBoundary>
                <div
                    onFocus={() => this.handleCanvasFocus(KEY_CANVAS_LIST)}
                    tabIndex={(triggers?.length > 0 || nodes?.length > 0) && cursor?.view !== KEY_CANVAS_LIST ? 0 : -1}
                />
                <TaskbotCanvasList
                    mode={mode}
                    active={activeCanvas === EditorLayout.RIGHT_CANVAS}
                    loading={loading}
                    workspaceName={workspaceName}
                    searchResults={searchParameters?.type && !isPrinting ? searchResults : null}
                    automationType={automationType}
                    automationReport={automationReport}
                    fileInterfaceMap={fileInterfaceMap}
                    debugger={dbugger}
                    clipboard={clipboard}
                    packageMap={packageMap}
                    triggerMap={triggerMap}
                    triggerGroups={triggerGroups}
                    commandMap={commandMap}
                    commandGroups={commandGroups}
                    commandProperties={commandProperties}
                    iteratorGroups={iteratorGroups}
                    iteratorMap={iteratorMap}
                    conditionalGroups={conditionalGroups}
                    conditionalMap={conditionalMap}
                    exceptionGroups={exceptionGroups}
                    exceptionMap={exceptionMap}
                    globalValues={globalValues}
                    taskAliases={taskAliases}
                    variableGroups={variableGroups}
                    variableMap={variableMap}
                    variables={variables}
                    breakpoints={breakpoints}
                    onBreakpointsChange={!isPrinting ? onBreakpointsChange : null}
                    triggers={triggers}
                    nodes={nodes}
                    onNodeChange={onNodesChange && !isPrinting ? this.handleNodeChange : null}
                    cursor={!isPrinting ? cursor : null}
                    onCursorChange={onCursorChange && !isPrinting ? this.handleCursorChange : null}
                    collapsed={collapsed}
                    onCollapsedChange={!isPrinting ? onCollapsedChange : null}
                    onCopy={onCopy}
                    opened={opened}
                    onOpenedChange={onOpenedChange}
                    sizes={sizes}
                    onResize={onResize}
                    draggingOver={draggingOver}
                    draggingFrom={draggingFrom}
                    draggingTo={draggingTo}
                    draggingType={draggingType}
                    onDragOver={mode === 'edit' ? this.handleDragOverList : null}
                    onDrop={mode === 'edit' ? this.handleDrop : null}
                    onNodeDragStart={mode === 'edit' ? this.handleNodeDragStart : null}
                    onNodeDragEnd={mode === 'edit' ? this.handleDragEnd : null}
                    onNodeDragOver={mode === 'edit' ? this.handleNodeDragOver : null}
                    onNodeCopy={mode === 'edit' ? this.handleNodeCopy : null}
                    onNodeCut={mode === 'edit' ? this.handleNodeCut : null}
                    onNodePaste={mode === 'edit' ? this.handleNodePaste : null}
                    onNodeDelete={mode === 'edit' ? this.handleNodeDelete : null}
                    onNodeRunFrom={canRun ? this.handleNodeRunFrom : null}
                    onAddSuggestions={mode === 'edit' && hasFeatureTaskbotGptSuggestions && hasEditorSettingSuggestNextActions
                        ? this.handleQuickAddSuggestionSubmit
                        : null}
                    onAppendItem={this.handleAppendCommand}
                    newNodeUid={newNodeUid}
                    nodeMetrics={this.selectNodeMetrics(this.props)}
                    isPrinting={isPrinting}
                    t={t}
                />
            </ErrorBoundary>
        );
    }

    renderDetails() {
        const {
            mode,
            automationType,
            automationIntendedPlatform,
            automationReport,
            fileInterfaceMap,
            cursor,
            debugger: dbugger,
            opened, onOpenedChange,
            packageMap,
            sessionTypes,
            iteratorGroups, iteratorMap,
            conditionalGroups, conditionalMap,
            exceptionGroups, exceptionMap,
            externalOptions, onExternalOptionsChange,
            desktopOperationStageMap,
            triggerGroups, triggerMap,
            commandGroups, commandMap, commandProperties,
            globalValues, taskAliases,
            variableGroups, variableMap,
            onVariablesChange,
            onCopy, onGlobalCopy, onNodesChange, onBreakpointsChange,
            onObjectCaptureRequest, onAnchorCaptureRequest, onImageCaptureRequest, onCoordinateCaptureRequest, onRegionCaptureRequest,
            onAssistantPageOpen,
            desktop, windows, windowGroups, browserTabs,
            workspaceName, fileId,
            secureRecording,
            canRecord,
            hasChanges,
            controlRoomVersion,
            onTabChange,
            t,
        } = this.props;
        if (cursor?.uids?.size > 0) {
            const cursorCount = this.selectCursorDetailsCount(this.props);
            const breakpointCount = this.selectCursorBreakpointCount(this.props);
            const disabledCount = this.selectCursorDisabledCount(this.props);
            const triggerCount = this.selectCursorTriggerCount(this.props);
            const commandCount = this.selectCursorCommandCountWithoutRoot(this.props);
            const edgeCount = this.selectCursorEdgeCount(this.props);

            const canCopy = (triggerCount + commandCount) > 0 && (triggerCount > 0) !== (commandCount > 0);
            const canDelete = triggerCount + commandCount + edgeCount > 0;

            const actions = [];
            if (onBreakpointsChange && triggerCount === 0) {
                actions.push(
                    <ActionBar.Action
                        key="breakpoint-enable"
                        name="multiple-breakpoint-enable"
                        label={t('taskbot:action-multiple-breakpoint-enable')}
                        aa="misc-breakpoint"
                        onClick={breakpointCount === cursorCount ? null : this.handleMultipleBreakpointEnable}
                    />,
                );
                actions.push(
                    <ActionBar.Action
                        key="breakpoint-disable"
                        name="multiple-breakpoint-disable"
                        label={t('taskbot:action-multiple-breakpoint-disable')}
                        aa="misc-breakpoint-clear"
                        onClick={breakpointCount === 0 ? null : this.handleMultipleBreakpointDisable}
                    />,
                );
                actions.push(
                    <ActionBar.Separator key="breakpoint-separator"/>,
                );
            }
            if (mode === 'edit' && onNodesChange && getAutomationTypeHasDisable(automationReport.type)) {
                actions.push(
                    <ActionBar.Action
                        key="enable"
                        name="multiple-enable"
                        label={t('taskbot:action-multiple-action-enable')}
                        aa="action-toggle--enabled"
                        onClick={disabledCount === 0 ? null : this.handleMultipleEnable}
                    />,
                );
                actions.push(
                    <ActionBar.Action
                        key="disable"
                        name="multiple-disable"
                        label={t('taskbot:action-multiple-action-disable')}
                        aa="action-toggle--disabled"
                        onClick={disabledCount === cursorCount ? null : this.handleMultipleDisable}
                    />,
                );
                actions.push(
                    <ActionBar.Separator key="enable-separator"/>,
                );
            }
            if (onCopy && canCopy) {
                actions.push(
                    <ActionBar.Action
                        key="copy"
                        name="multiple-copy"
                        label={t('taskbot:action-multiple-action-copy')}
                        aa="action-clipboard-copy"
                        onClick={this.handleMultipleCopy}
                    />,
                );
            }
            if (mode === 'edit' && onCopy && onNodesChange && canCopy) {
                actions.push(
                    <ActionBar.Action
                        key="cut"
                        name="multiple-cut"
                        label={t('taskbot:action-multiple-action-cut')}
                        aa="action-clipboard-cut"
                        onClick={this.handleMultipleCut}
                    />,
                );
            }
            if (mode === 'edit' && onNodesChange && canDelete) {
                actions.push(
                    <ActionBar.Action
                        key="delete"
                        theme="error"
                        name="multiple-delete"
                        label={t('taskbot:action-multiple-action-delete')}
                        iconName="close-x"
                        onClick={this.handleMultipleDelete}
                    />,
                );
            }
            actions.push(
                <ActionBar.Separator key="clipboard-separator"/>,
            );
            if (onGlobalCopy && canCopy) {
                actions.push(
                    <ActionBar.Action
                        key="shared-clipboard-copy"
                        name="multiple-shared-clipboard-copy"
                        label={t('taskbot:action-toolbar-shared-clipboard-copy')}
                        aa="action-clipboard-copy--shared"
                        onClick={this.handleGlobalCopy}
                    />,
                );
            }

            return (
                <EditorDetails
                    title={t('taskbot:details-title-multiple')}
                    count={cursorCount}
                    actions={actions}
                >
                    <EditorDetails.Selection
                        count={cursorCount}
                        actions={actions.length > 0 ? (
                            <ActionBar>
                                {actions}
                            </ActionBar>
                        ) : null}
                        labelSelected={t('taskbot:details-content-selected')}
                    />
                </EditorDetails>
            );
        }

        const {node, disabled} = this.selectDetailsNode(this.props, this.state);
        let nodeType;
        let object;
        if (node) {
            if (node.commandName) {
                nodeType = NODE_TYPE_COMMAND;
                object = commandMap[getPackageCommandKey(node)];
            }
            else if (node.triggerName) {
                nodeType = NODE_TYPE_TRIGGER;
                object = triggerMap[getPackageTriggerKey(node)];
            }
        }
        if (!node || !nodeType) {
            return getAutomationTypeIsProcess(automationType)
                ? (
                    <EditorDetails
                        title={t('taskbot:details-title-default--process')}
                        labelEmpty={mode === 'edit'
                            ? t('taskbot:details-content-edit-default--process')
                            : t('taskbot:details-content-view-default--process')
                        }
                    />
                )
                : (
                    <EditorDetails
                        title={t('taskbot:details-title-default')}
                        labelEmpty={mode === 'edit'
                            ? t('taskbot:details-content-edit-default')
                            : t('taskbot:details-content-view-default')
                        }
                    />
                );
        }

        const labelDisabled = disabled ? ` ${t('label-parens-disabled')}` : '';
        if (!object) {
            let title;
            let body;
            if (!packageMap[node.packageName]) {
                title = t('taskbot:validation-error-package-missing-title');
                body = t('taskbot:validation-error-package-missing-version');
            }
            else {
                title = node.commandName
                    ? t('taskbot:validation-error-resource-missing-title--command')
                    : t('taskbot:validation-error-resource-missing-title--trigger');
                body = t('taskbot:validation-error-resource-missing');
            }
            return (
                <EditorDetails title={`${node.packageName || '?'}:${node.commandName || node.triggerName || '?'}${labelDisabled}`}>
                    <Message
                        theme="error"
                        title={title}
                        controls={getAutomationTypeHasPackages(automationType) ? (
                            <CommandButton onClick={() => onTabChange('packages')}>
                                {t('taskbot:packages-goto')}
                            </CommandButton>
                        ) : null}
                    >
                        {body}
                    </Message>
                </EditorDetails>
            );
        }

        const {newNodeUid} = this.state;
        const nodeReport = automationReport?.nodeReports?.[node.uid];
        const nodeWindows = this.selectNodeWindows(this.props);
        const windowActions = this.renderWindowActions();
        const browserTabActions = this.renderBrowserTabActions();
        const recorderPackage = this.selectRecorderPackage(this.props);
        const buttons = [];
        if (nodeReport?.hasCodeViolation) {
            buttons.push(
                <ActionBar.Action
                    key="node-code-violations"
                    name="node-code-violations"
                    label={t('taskbot:details-title-code-analysis')}
                    iconName="self-closing-tag"
                    onClick={() => onAssistantPageOpen(`issues CODE_ANALYSIS ${node.uid}`)}
                />,
            );
        }
        if (getHasHelp(object.tutorialWidgetPage, object.tutorialUrl)) {
            buttons.push(
                <ActionBar.Action
                    key="node-tutorial"
                    name="node-tutorial"
                    label={t('taskbot:details-title-tutorial')}
                    fa="play-circle"
                    onClick={() => handleHelpClick(object.tutorialWidgetPage, object.tutorialUrl)}
                />,
            );
        }
        if (getHasHelp(object.documentationWidgetPage, object.documentationUrl)) {
            buttons.push(
                <ActionBar.Action
                    key="node-documentation"
                    name="node-documentation"
                    label={t('taskbot:details-title-documentation')}
                    iconName="documentation"
                    onClick={() => handleHelpClick(object.documentationWidgetPage, object.documentationUrl)}
                />,
            );
        }

        const anchorLabels = this.selectAnchorLabels(this.props);
        const parentAnchorLabels = this.selectParentAnchorLabels(this.props, node.uid);
        return (
            <ErrorBoundary>
                <EditorDetails
                    title={`${TaskbotNodeTitle.getObjectTitle({
                        nodeType,
                        object,
                        objectPackage: packageMap[object.packageName],
                        automationType,
                    })}${labelDisabled}`}
                    buttons={buttons.length > 0 ? (
                        <div>
                            <ActionBar>{buttons}</ActionBar>
                        </div>
                    ) : null}
                    disabled={disabled}
                >
                    <TaskbotNodeDetails
                        detailsComponent={TaskbotNodeDetails}
                        key={node.uid}
                        automationType={automationType}
                        automationIntendedPlatform={automationIntendedPlatform}
                        nodeType={nodeType}
                        form={`taskbot-node-${node.uid}`}
                        mode={mode === 'edit' ? 'edit' : 'view'}
                        fileInterfaceMap={fileInterfaceMap}
                        object={object}
                        disabled={disabled}
                        opened={opened}
                        hasCodeViolation={Boolean(nodeReport?.hasCodeViolation)}
                        treeErrors={nodeReport?.treeErrors}
                        automationReport={automationReport}
                        hasChanges={hasChanges}
                        onOpenedChange={onOpenedChange}
                        workspaceName={workspaceName}
                        fileId={fileId}
                        node={node}
                        nodeError={node && dbugger && dbugger.cursor && dbugger.cursor.uid === node.uid && dbugger.cursor.error || null}
                        nodeWindows={nodeWindows}
                        anchorLabels={anchorLabels}
                        parentAnchorLabels={parentAnchorLabels}
                        desktop={desktop}
                        onCursorChange={this.handleCursorChange}
                        onFileRequest={canRecord ? this.handleFileRequest : null}
                        onOperationButtonRequest={canRecord ? this.handleOperationButtonRequest : null}
                        onOperationTreeRequest={canRecord ? this.handleOperationTreeRequest : null}
                        onOperationTableRequest={canRecord ? this.handleOperationTableRequest : null}
                        onOperationSelectRequest={canRecord ? this.handleOperationSelectRequest : null}
                        onObjectCaptureRequest={canRecord && onObjectCaptureRequest ? this.handleObjectCaptureRequest : null}
                        onAnchorCaptureRequest={canRecord && onAnchorCaptureRequest ? this.handleAnchorCaptureRequest : null}
                        onImageCaptureRequest={canRecord && onImageCaptureRequest ? this.handleImageCaptureRequest : null}
                        onCoordinateCaptureRequest={canRecord && onCoordinateCaptureRequest ? this.handleCoordinateCaptureRequest : null}
                        onRegionCaptureRequest={canRecord && onRegionCaptureRequest ? this.handleRegionCaptureRequest : null}
                        secureRecording={secureRecording}
                        rootBusinessAttributes={this.selectRootBusinessAttributes(this.props)}
                        windows={windows}
                        windowGroups={windowGroups}
                        windowActions={windowActions}
                        browserTabs={browserTabs}
                        browserTabActions={browserTabActions}
                        packageMap={packageMap}
                        recorderPackage={recorderPackage}
                        sessionTypes={sessionTypes}
                        desktopOperationStageMap={desktopOperationStageMap}
                        triggerGroups={triggerGroups}
                        triggerMap={triggerMap}
                        commandGroups={commandGroups}
                        commandMap={commandMap}
                        commandProperties={commandProperties}
                        iteratorGroups={iteratorGroups}
                        iteratorMap={iteratorMap}
                        conditionalGroups={conditionalGroups}
                        conditionalMap={conditionalMap}
                        exceptionGroups={exceptionGroups}
                        exceptionMap={exceptionMap}
                        externalOptions={externalOptions}
                        onExternalOptionsChange={onExternalOptionsChange}
                        globalValues={globalValues}
                        taskAliases={taskAliases}
                        variableGroups={variableGroups}
                        variableMap={variableMap}
                        variables={this.selectDetailsVariables(this.props)}
                        outputVariables={this.selectOutputVariables(this.props)}
                        onVariableOpen={this.handleVariableOpen}
                        onVariablesChange={onVariablesChange}
                        onSubmit={mode === 'edit' ? this.handleNodeSubmit : null}
                        touched={newNodeUid !== node.uid}
                        nodeMetrics={this.selectNodeMetrics(this.props)}
                        controlRoomVersion={controlRoomVersion}
                        isDebounced={this.state.detailsDebounced}
                    />
                </EditorDetails>
            </ErrorBoundary>
        );
    }

    renderVariableDetails() {
        const {variableDetails} = this.state;
        if (!variableDetails) {
            return null;
        }

        const {
            mode,
            nodes,
            automationType,
            automationIntendedPlatform,
            fileInterfaceMap,
            commandGroups, commandMap, commandProperties, sessionTypes,
            globalValues, taskAliases,
            variableMap, variables, variableGroups, getUnusedVariables,
            desktop, windows, windowGroups, browserTabs,
            workspaceName, fileId,
            t,
        } = this.props;
        const nodeWindows = this.selectNodeWindows(this.props);
        const windowActions = this.renderWindowActions();
        const browserTabActions = this.renderBrowserTabActions();
        const isVariableInputAllowed = getAutomationTypeIsProcess(automationType)
            ? getIsVariableInputAllowed(nodes?.at(0), {commandMap})
            : true;
        return (
            <TaskbotVariableDetails
                key={variableDetails.key}
                automationType={automationType}
                automationIntendedPlatform={automationIntendedPlatform}
                editorMode={mode}
                mode={variableDetails.mode}
                fileInterfaceMap={fileInterfaceMap}
                sessionTypes={sessionTypes}
                title={t('variables:title-edit-label')}
                workspaceName={workspaceName}
                fileId={fileId}
                nodeWindows={nodeWindows}
                windows={windows}
                windowGroups={windowGroups}
                windowActions={windowActions}
                browserTabs={browserTabs}
                browserTabActions={browserTabActions}
                desktop={desktop}
                onFileRequest={this.handleFileRequest}
                commandGroups={commandGroups}
                commandMap={commandMap}
                commandProperties={commandProperties}
                options={variableDetails.options}
                globalValues={globalValues}
                taskAliases={taskAliases}
                variable={variableDetails.mode === 'create' ? null : variableDetails.variable}
                variables={variables}
                variableMap={variableMap}
                variableGroups={variableGroups}
                isVariableInputAllowed={isVariableInputAllowed}
                getUnusedVariables={getUnusedVariables}
                onClose={this.handleVariableClose}
                onSubmit={this.handleVariableSubmit}
            />
        );
    }

    renderFinder() {
        const {finder} = this.state;
        if (!finder) {
            return null;
        }

        const {workspaceName, fileId, automationIntendedPlatform} = this.props;
        return (
            <TaskbotEditorFinder
                workspaceName={workspaceName}
                excludeFileId={fileId}
                fileHandlers={finder.fileHandlers}
                intendedPlatform={automationIntendedPlatform}
                onHide={this.handleFinderCancel}
                onSubmit={this.handleFinderSubmit}
                canClone
                show
            />
        );
    }

    renderSearch() {
        const {
            mode,
            search, searchParameters, searchResults,
            onSearchChange, onSearchParametersChange, onAssistantPageOpen,
            cursor,
            t,
        } = this.props;
        if (searchParameters?.type !== 'quick') {
            return null;
        }

        return (
            <TaskbotEditorSearch
                toolbarRef={this.toolbarRef}
                buttonRef={this.searchRef}
                inputRef={this.searchInputRef}

                mode={mode}

                value={search}
                onChange={onSearchChange}
                searchParameters={searchParameters}
                onSearchParametersChange={onSearchParametersChange}

                onAssistantPageOpen={onAssistantPageOpen}

                results={searchResults}

                cursor={cursor}
                onCursorChange={this.handleCursorChange}

                onClose={this.handleSearchClose}

                t={t}

                show
            />
        );
    }

    renderAddSwimlanes() {
        const {addSwimlanes} = this.state;
        if (!addSwimlanes) {
            return false;
        }

        const {t} = this.props;
        return (
            <Prompt
                id="process-editor-start-swimlanes"
                title={t('taskbot:swimlane-start-title')}
                labelSubmit={t('label-add')}
                labelCancel={t('label-cancel')}
                onSubmit={() => this.setState({addSwimlanes: null}, () => {
                    const {
                        commandMap,
                        iteratorMap,
                        conditionalMap,
                        triggerMap,
                        exceptionMap,
                        onCursorChange,
                        onNodesChange,
                    } = this.props;
                    const command = commandMap['swimlane#swimlane'];
                    const newSwimlane = {
                        uid: generateUUID(),
                        commandName: 'Swimlane',
                        packageName: 'Swimlane',
                        attributes: command
                            ? getDefaultAttributes(command.attributes, iteratorMap, conditionalMap, triggerMap, exceptionMap)
                            : [],
                        layout: {},
                    };
                    const swimlanes = [
                        newSwimlane,
                        {
                            uid: generateUUID(),
                            commandName: 'Swimlane',
                            packageName: 'Swimlane',
                            attributes: command
                                ? getDefaultAttributes(command.attributes, iteratorMap, conditionalMap, triggerMap, exceptionMap)
                                : [],
                            layout: {
                                initialNodeId: newSwimlane.uid,
                            },
                        },
                    ];
                    onNodesChange({swimlanes, swimlaneStacking: addSwimlanes.swimlaneStacking});
                    onCursorChange({uid: newSwimlane.uid, view: KEY_CANVAS_FLOW});
                    this.setState({newNodeUid: newSwimlane.uid});
                    this.setNodesChanged(newSwimlane);
                })}
                onHide={() => this.setState({addSwimlanes: null})}
                show
            >
                <Help>{t('taskbot:swimlane-start-help')}</Help>
                <RadioGroup
                    value={addSwimlanes.swimlaneStacking}
                    onChange={(swimlaneStacking) => this.setState({addSwimlanes: {swimlaneStacking}})}
                >
                    <RadioInput
                        name="TOP_TO_BOTTOM"
                        content={<Help>{t('taskbot:swimlane-start-help--top-to-bottom')}</Help>}
                    >
                        {t('taskbot:swimlane-start-option--top-to-bottom')}
                    </RadioInput>
                    <RadioInput
                        name="LEFT_TO_RIGHT"
                        content={<Help>{t('taskbot:swimlane-start-help--left-to-right')}</Help>}
                    >
                        {t('taskbot:swimlane-start-option--left-to-right')}
                    </RadioInput>
                </RadioGroup>
            </Prompt>
        );
    }

    renderError() {
        const {t} = this.props;
        const {error} = this.state;
        return renderErrorAlert(t, error, () => this.setState({error: null}));
    }

    renderWithContext = (content, isPrinting) => {
        const {
            // report
            automationReport,

            triggers,
            nodes,
            orphans,
            swimlanes,
            swimlaneStacking,
            variables,

            // packageDetails
            packageMap,
            triggerGroups,
            triggerMap,
            commandGroups,
            commandMap,
            commandProperties,
            iteratorGroups,
            iteratorMap,
            conditionalGroups,
            conditionalMap,
            exceptionGroups,
            exceptionMap,
            variableGroups,
            variableMap,

            // editor state
            mode,
            sizes,
            clipboard,
            cursor,
            collapsed,
            opened,
            breakpoints,
            searchResults,
            desktopOperationStageMap,
            sessionTypes,
            finderHandlers,
            fileInterfaceMap,
            debugger: dbugger,
            taskAliases,
            globalValues,
            canRecord,
            canRun,
            workspaceName,

            // Handlers
            onFileOpen,
            onCursorChange,
            onNodesChange,
            onBreakpointsChange,
            onOpenedChange,
            onCollapsedChange,
            onCopy,
            onResize,
            onObjectCaptureRequest,
            onAnchorCaptureRequest,
            onImageCaptureRequest,
            onCoordinateCaptureRequest,
            onRegionCaptureRequest,
        } = this.props;
        const {
            draggingOver,
            draggingFrom,
            draggingTo,
            draggingType,
            newNodeUid,
        } = this.state;
        return (
            <EditorContextProvider
                report={automationReport}
                content={{
                    triggers,
                    nodes,
                    swimlanes,
                    swimlaneStacking,
                    orphans,
                    variables,
                }}
                packageDetails={{
                    packageMap,
                    triggerGroups,
                    triggerMap,
                    commandGroups,
                    commandMap,
                    commandProperties,
                    iteratorGroups,
                    iteratorMap,
                    conditionalGroups,
                    conditionalMap,
                    exceptionGroups,
                    exceptionMap,
                    variableGroups,
                    variableMap,
                }}
                state={{
                    cursor: isPrinting ? cursor : null,
                    isPrinting,
                    debugger: dbugger,
                    mode,
                    breakpoints,
                    clipboard,
                    collapsed,
                    opened,
                    searchResults,
                    desktopOperationStageMap,
                    sessionTypes,
                    finderHandlers,
                    fileInterfaceMap,
                    taskAliases,
                    variables,
                    sizes,
                    draggingOver,
                    draggingFrom,
                    draggingTo,
                    draggingType,
                    newNodeUid,
                    globalValues,
                    canRecord,
                    canRun,
                    workspaceName,
                }}
                handlers={{
                    onFileOpen,
                    onBreakpointsChange: !isPrinting ? onBreakpointsChange : null,
                    onNodeChange: onNodesChange && !isPrinting ? this.handleNodeChange : null,
                    onCursorChange: onCursorChange && !isPrinting ? this.handleCursorChange : null,
                    onCollapsedChange: !isPrinting ? onCollapsedChange : null,
                    onCopy,
                    onOpenedChange,
                    onResize,
                    onDragOver: mode === 'edit' ? this.handleDragOverList : null,
                    onDrop: mode === 'edit' ? this.handleDrop : null,
                    onNodeDragStart: mode === 'edit' ? this.handleNodeDragStart : null,
                    onNodeDragEnd: mode === 'edit' ? this.handleDragEnd : null,
                    onNodeDragOver: mode === 'edit' ? this.handleNodeDragOver : null,
                    onNodeCopy: mode === 'edit' ? this.handleNodeCopy : null,
                    onNodeCut: mode === 'edit' ? this.handleNodeCut : null,
                    onNodePaste: mode === 'edit' ? this.handleNodePaste : null,
                    onNodeDelete: mode === 'edit' ? this.handleNodeDelete : null,
                    onNodeRunFrom: canRun ? this.handleNodeRunFrom : null,
                    onFileRequest: canRecord ? this.handleFileRequest : null,
                    onOperationButtonRequest: canRecord ? this.handleOperationButtonRequest : null,
                    onOperationTreeRequest: canRecord ? this.handleOperationTreeRequest : null,
                    onOperationTableRequest: canRecord ? this.handleOperationTableRequest : null,
                    onOperationSelectRequest: canRecord ? this.handleOperationSelectRequest : null,
                    onObjectCaptureRequest: canRecord && onObjectCaptureRequest ? this.handleObjectCaptureRequest : null,
                    onAnchorCaptureRequest: canRecord && onAnchorCaptureRequest ? this.handleAnchorCaptureRequest : null,
                    onImageCaptureRequest: canRecord && onImageCaptureRequest ? this.handleImageCaptureRequest : null,
                    onCoordinateCaptureRequest: canRecord && onCoordinateCaptureRequest ? this.handleCoordinateCaptureRequest : null,
                    onRegionCaptureRequest: canRecord && onRegionCaptureRequest ? this.handleRegionCaptureRequest : null,
                }}
            >
                {content}
            </EditorContextProvider>
        );
    };

    render() {
        return (
            <WithPrintable
                renderContent={({renderDisplay, renderPrint}) => (
                    <>
                        {renderPrint(() => this.renderWithContext(
                            this.renderList({hasCanvasList: true, isPrinting: true}),
                            true,
                        ))}
                        {renderDisplay(() => {
                            const {
                                automationType,
                                automationIntendedPlatform,
                                sizes,
                                hasFeatureMacOsPlatformSupport,
                                t,
                            } = this.props;
                            const activeCanvas = this.selectActiveCanvas(this.props, this.state);
                            const hasCanvasFlow = getAutomationTypeHasCanvasFlow(automationType);
                            const hasCanvasList = getAutomationTypeHasCanvasList(automationType);
                            return this.renderWithContext((
                                <>
                                    <Sized onChange={this.handleEditorSizeChange}/>
                                    <EditorLayout
                                        editorRef={this.editorRef}
                                        paletteRef={this.paletteRef}
                                        toolbarRef={this.toolbarRef}
                                        leftCanvasRef={this.leftCanvasRef}
                                        rightCanvasRef={this.rightCanvasRef}
                                        detailsRef={this.detailsRef}
                                        debug={this.renderDebug()}
                                        palette={this.renderPalette()}
                                        paletteSize={sizes.get(KEY_PALETTE)}
                                        onPaletteResize={this.handlePaletteResize}
                                        toolbar={this.renderToolbar()}
                                        activeCanvas={activeCanvas}
                                        leftCanvas={this.renderFlow({activeCanvas, hasCanvasFlow, hasCanvasList})}
                                        rightCanvas={this.renderList({activeCanvas, hasCanvasFlow, hasCanvasList})}
                                        canvasSize={sizes.get(KEY_CANVAS)}
                                        onCanvasResize={this.handleCanvasResize}
                                        canvasTypeIndicator={hasFeatureMacOsPlatformSupport && automationIntendedPlatform ? (
                                            <RioPill
                                                variant="NEUTRAL_SOFTEST"
                                                renderIcon={() => <RioIcon iconName="device--default"/>} label={platformToString(automationIntendedPlatform, t, automationType)}
                                            />
                                        ) : null}
                                        details={this.renderDetails()}
                                        detailsSize={sizes.get(KEY_DETAILS)}
                                        onDetailsResize={this.handleDetailsResize}
                                        isTopBorderHidden
                                        labelAltLoading="Loading"
                                        labelAltWorking="Saving"
                                        labelAriaTogglePalette="Toggle palette"
                                        labelAriaToggleDetails="Toggle details"
                                    />
                                    {this.renderError()}
                                    {this.renderVariableDetails()}
                                    {this.renderFinder()}
                                    {this.renderSearch()}
                                    {this.renderAddSwimlanes()}
                                </>
                            ), false);
                        })}
                    </>
                )}
            />
        );
    }
}

export {TaskbotEditor};
