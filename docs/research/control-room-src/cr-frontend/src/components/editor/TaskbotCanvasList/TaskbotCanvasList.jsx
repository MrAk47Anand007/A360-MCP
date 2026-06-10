/**
 * Copyright (c) 2022 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import React, {createRef, PureComponent} from 'react';
import {createSelector} from 'reselect';
import classnames from 'classnames';
import {
    Icon, RioIcon,
    CheapSet,
    addEventListener, removeEventListener, getEventKey, getEventHasExactModifierKeys,
} from '@automationanywhere/rio-components';

import {
    KEY_CANVAS_LIST,
    POSITION_END, POSITION_NONE,
    getNodeNieghbors,
    NODE_TYPE_COMMAND,
    NODE_TYPE_TRIGGER,
    getNodeParents,
    getNode,
    forNodesWithMetadata,
    getPackageCommandKey,
} from '../utils/nodes';
import {CREATE_SELECTOR_EFFECT_OPTIONS} from '../../../util/reselect';
import {TaskbotNodeQuickAdd} from '../TaskbotNodeQuickAdd';

import {TaskbotCanvasListNode} from './Node';

import './TaskbotCanvasList.scss';

const GUTTER_SPACE_PX = 32;

const DRAG_SCROLL_PAN = 100;

const getObject = (node, objectMap) => {
    if (!node) {
        return null;
    }
    const key = `${node.packageName}#${node.commandName || node.triggerName}`.toLowerCase();
    return objectMap[key];
};

const getIsContainedBy = (elementRect, containerRect) => (
    (containerRect.top <= elementRect.bottom && containerRect.top >= elementRect.top) ||
    (containerRect.bottom <= elementRect.bottom && containerRect.bottom >= elementRect.top) ||
    (containerRect.top <= elementRect.top && containerRect.bottom >= elementRect.bottom)
);

const getNumberWidthPx = (number, characterWidthPx, extraWidthPx = 0) => number > 0
    ? String(number).length * characterWidthPx + extraWidthPx
    : 0;

class TaskbotCanvasList extends PureComponent {
    static displayName = 'TaskbotCanvasList';

    constructor(props) {
        super(props);

        this.rootRef = createRef();
        this.editorRef = createRef();

        this.dragScrollCallback = null;
        this.dragScrollTimeout = 0;

        this.selectLineNumbers = createSelector(
            (props) => props.nodeMetrics,
            (nodeMetrics) => {
                const result = {...nodeMetrics};
                const numberWidthPx = Math.max(
                    getNumberWidthPx(result.nodeNumbers, 8, 4),
                    getNumberWidthPx(result.triggerNumbers, 8, 12),
                );
                result.numberStyle = {
                    width: `${numberWidthPx}px`,
                };
                result.editorStyle = {
                    paddingLeft: `${GUTTER_SPACE_PX + numberWidthPx}px`,
                };
                return result;
            },
        );

        this.selectCursor = createSelector(
            (props) => props.cursor && props.cursor.uid || props.debugger && props.debugger.cursor && props.debugger.cursor.uid || null,
            (cursorUid) => {
                if (!cursorUid) {
                    return;
                }

                clearTimeout(this.scrollTimeout);
                this.scrollTimeout = setTimeout(() => this.calculateScrollToNode(cursorUid), 50);
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.selectVisibility = createSelector(
            (props) => props.triggers.length > 0 ? props.triggers : false,
            (props) => {
                const validNodes = props.nodes.filter((node) => props.mode === 'debug'
                    ? node && node.uid && !node.disabled
                    : node && node.uid,
                );
                return validNodes.length > 0 ? props.nodes : false;
            },
            (props) => props.packageMap,
            (props) => props.collapsed,
            (props) => props.mode,
            () => {
                clearTimeout(this.visibilityTimeout);
                this.visibilityTimeout = setTimeout(this.calculateVisibility, 100);
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.setVisibility = (nextVisibleUids) => {
            const {visibleUids} = this.state;
            if (visibleUids.size === nextVisibleUids.size && [...visibleUids].every((uid) => nextVisibleUids.has(uid))) {
                return;
            }

            this.setState({visibleUids: nextVisibleUids});
        };

        this.selectCursorParentUids = createSelector(
            (props) => props.cursor,
            (props) => props.nodes,
            (cursor, nodes) => {
                const parentSet = new Set();
                if (cursor) {
                    const cursorSet = new Set(cursor.uids);
                    if (cursor.uid) {
                        cursorSet.add(cursor.uid);
                    }
                    forNodesWithMetadata(nodes, (node, {parentNodes}) => {
                        if (cursorSet.has(node.uid)) {
                            parentNodes.forEach((node) => parentSet.add(node.uid));
                        }
                    });
                }
                return parentSet;
            },
        );

        this.state = {
            visibleUids: new Set(),
        };
    }

    calculateScrollToNode = (cursorUid) => {
        clearTimeout(this.scrollTimeout);
        if (!cursorUid) {
            return;
        }

        const scroller = this.rootRef.current;
        if (!scroller) {
            return;
        }

        const element = scroller.querySelector(`.taskbot-canvas-list-node__title[data-node-uid="${cursorUid}"]`);
        if (!element) {
            return;
        }

        const elementRect = element.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        if (elementRect.top - 3 < scrollerRect.top) {
            scroller.scrollTop = Math.max(0,
                scroller.scrollTop + elementRect.top - 3 - scrollerRect.top,
            );
            this.handleScroll();
            return;
        }

        const scrollBarHeight = (scroller.offsetHeight - scroller.clientHeight) || 0;
        if (elementRect.bottom + 3 > scrollerRect.bottom - scrollBarHeight) {
            scroller.scrollTop = Math.max(0,
                scroller.scrollTop + elementRect.bottom + 3 - scrollerRect.bottom + scrollBarHeight,
            );
            this.handleScroll();
            return;
        }
    };

    calculateVisibility = () => {
        clearTimeout(this.visibilityTimeout);
        if (process.env.NODE_ENV === 'test') {
            return;
        }

        const visibleUids = new Set();
        if (window.showAllNodes) {
            this.setVisibility(visibleUids);
            return;
        }

        const scroller = this.rootRef.current;
        if (!scroller) {
            this.setVisibility(visibleUids);
            return;
        }

        const elements = scroller.querySelectorAll('.taskbot-canvas-list-node__title[data-node-uid]');
        if (elements.length === 0) {
            this.setVisibility(visibleUids);
            return;
        }

        if (elements.length <= 64) {
            for (let index = 0; index < elements.length; index++) {
                visibleUids.add(elements[index].getAttribute('data-node-uid'));
            }
            this.setVisibility(visibleUids);
            return;
        }

        const scrollerRect = scroller.getBoundingClientRect();
        const elementRectMap = new Map();
        let elementRect;
        let foundIndex = -1;
        let index = 0;
        let minimum = 0;
        let maximum = elements.length - 1;
        while (elements[index]) {
            elementRect = elements[index].getBoundingClientRect();
            elementRectMap.set(index, elementRect);
            if (getIsContainedBy(elementRect, scrollerRect)) {
                foundIndex = index;
                break;
            }

            if (minimum === maximum) {
                break;
            }

            // above container
            if (elementRect.bottom < scrollerRect.top) {
                minimum = index + 1;
                index = Math.floor(minimum + ((maximum - minimum) / 2));
            }
            // below container
            else if (elementRect.top > scrollerRect.bottom) {
                maximum = index - 1;
                index = Math.floor(minimum + ((maximum - minimum) / 2));
            }
            else {
                break;
            }
        }

        if (foundIndex !== -1) {
            visibleUids.add(elements[foundIndex].getAttribute('data-node-uid'));

            // get visible items above
            let index = foundIndex - 1;
            while (elements[index]) {
                elementRect = elementRectMap.get(index) || elements[index].getBoundingClientRect();
                if (getIsContainedBy(elementRect, scrollerRect)) {
                    visibleUids.add(elements[index].getAttribute('data-node-uid'));
                    index--;
                }
                else {
                    break;
                }
            }

            // get visible items below
            index = foundIndex + 1;
            while (elements[index]) {
                elementRect = elementRectMap.get(index) || elements[index].getBoundingClientRect();
                if (getIsContainedBy(elementRect, scrollerRect)) {
                    visibleUids.add(elements[index].getAttribute('data-node-uid'));
                    index++;
                }
                else {
                    break;
                }
            }
        }
        this.setVisibility(visibleUids);
    };

    handleDragScroll = (event, delta) => {
        event.stopPropagation();
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'none';
        }
        this.dragScrollCallback = () => {
            this.dragScrollTimeout = 0;
            this.dragScrollCallback = null;
            const scroller = this.rootRef.current;
            if (scroller) {
                scroller.scrollTop = scroller.scrollTop + delta * DRAG_SCROLL_PAN;
            }
        };
        if (!this.dragScrollTimeout) {
            this.dragScrollTimeout = setTimeout(() => {
                if (this.dragScrollCallback) {
                    this.dragScrollCallback();
                }
            }, 50);
        }
    };

    handleScroll = () => {
        clearTimeout(this.visibilityTimeout);
        this.visibilityTimeout = setTimeout(this.calculateVisibility, 200);
    };

    handleDragOverCommands = (event) => {
        if (!this._isMounted) {
            return;
        }

        const {mode, draggingType, onDragOver} = this.props;
        if (mode !== 'edit' || draggingType !== NODE_TYPE_COMMAND || !onDragOver) {
            return;
        }

        onDragOver(event, NODE_TYPE_COMMAND, true);
    };

    handleDragOverTriggers = (event) => {
        if (!this._isMounted) {
            return;
        }

        const {mode, draggingType, onDragOver} = this.props;
        if (mode !== 'edit' || draggingType !== NODE_TYPE_TRIGGER || !onDragOver) {
            return;
        }

        onDragOver(event, NODE_TYPE_TRIGGER, true);
    };

    handleClick = (event) => {
        if (!this._isMounted) {
            return;
        }

        const editor = this.editorRef.current;
        if (editor !== event.target) {
            return;
        }

        const {onCursorChange} = this.props;
        if (!onCursorChange) {
            return;
        }

        onCursorChange(null);
    };

    handleKeyDown = (event) => {
        if (!this._isMounted) {
            return;
        }

        const {active, cursor} = this.props;
        if (!active || cursor?.view !== KEY_CANVAS_LIST) {
            return;
        }

        let element = this.rootRef.current;
        while (element) {
            if (element.getAttribute('aria-hidden') === 'true') {
                return;
            }
            element = element.parentElement;
        }

        const key = getEventKey(event);
        const hasShiftKey = getEventHasExactModifierKeys(event, {shiftKey: true});
        switch (key) {
            case 'ArrowUp': {
                event.preventDefault();
                event.stopPropagation();
                const {mode, triggerMap, commandMap, triggers, nodes, collapsed, onCursorChange} = this.props;
                if (!onCursorChange) {
                    return;
                }

                const {north} = getNodeNieghbors(triggerMap, commandMap, triggers, nodes, (node) => node.uid === cursor.uid, collapsed, mode, KEY_CANVAS_LIST);
                if (!north) {
                    return;
                }

                const uid = north.uid;
                if (cursor && hasShiftKey) {
                    const uids = cursor.uids || new CheapSet();
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids: uids.clone(), view: KEY_CANVAS_LIST});
                    return;
                }

                if (cursor && cursor.uids && (cursor.uid === uid || cursor.uids.has(uid))) {
                    const uids = cursor.uids;
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids, view: KEY_CANVAS_LIST});
                    return;
                }

                onCursorChange({uid, view: KEY_CANVAS_LIST});
                break;
            }
            case 'ArrowDown': {
                event.preventDefault();
                event.stopPropagation();
                const {mode, triggerMap, commandMap, triggers, nodes, collapsed, onCursorChange} = this.props;
                if (!onCursorChange) {
                    return;
                }

                const {south} = getNodeNieghbors(triggerMap, commandMap, triggers, nodes, (node) => node.uid === cursor.uid, collapsed, mode, KEY_CANVAS_LIST);
                if (!south) {
                    return;
                }

                const uid = south.uid;
                if (cursor && hasShiftKey) {
                    const uids = cursor.uids || new CheapSet();
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids: uids.clone(), view: KEY_CANVAS_LIST});
                    return;
                }

                if (cursor && cursor.uids && (cursor.uid === uid || cursor.uids.has(uid))) {
                    const uids = cursor.uids;
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids, view: KEY_CANVAS_LIST});
                    return;
                }

                onCursorChange({uid, view: KEY_CANVAS_LIST});
                break;
            }
            case 'ArrowRight': { // Expand node
                event.preventDefault();
                event.stopPropagation();
                const {collapsed, onCollapsedChange} = this.props;
                if (!onCollapsedChange || !cursor.uid) {
                    return;
                }

                onCollapsedChange(collapsed.remove(`node:${cursor.uid}`).clone());

                break;
            }
            case 'ArrowLeft': { // Collapse node
                event.preventDefault();
                event.stopPropagation();
                const {nodes, collapsed, commandMap, onCollapsedChange, onCursorChange} = this.props;
                if (!onCollapsedChange || !cursor.uid) {
                    return;
                }

                const node = getNode(nodes, (node) => node.uid === cursor.uid);
                if (!node) {
                    return;
                }

                const command = commandMap[getPackageCommandKey(node)];
                if (!command) {
                    return;
                }

                if ((command.nestable || command.branchable) && !collapsed.has(`node:${cursor.uid}`)) {
                    onCollapsedChange(collapsed.add(`node:${cursor.uid}`).clone());
                    return;
                }

                if (onCursorChange) {
                    const [, parentNode] = getNodeParents(nodes, cursor.uid, {includeBranches: true, reverseOrder: true});
                    if (parentNode?.uid) {
                        onCollapsedChange(collapsed.add(`node:${parentNode.uid}`).clone());
                        onCursorChange({...cursor, uid: parentNode.uid});
                    }
                }
                break;
            }
        }
    };

    componentDidMount() {
        this._isMounted = true;
        this.selectCursor(this.props);
        this.selectVisibility(this.props);
        addEventListener(window, 'keydown', this.handleKeyDown, true);
        this.visibilityTimeout = setTimeout(this.calculateVisibility, 50);
    }

    componentDidUpdate() {
        this.selectCursor(this.props);
        this.selectVisibility(this.props);
    }

    componentWillUnmount() {
        this._isMounted = false;
        clearTimeout(this.dragScrollTimeout);
        clearTimeout(this.scrollTimeout);
        clearTimeout(this.visibilityTimeout);
        removeEventListener(window, 'keydown', this.handleKeyDown, true);
    }

    render() {
        const {
            mode,
            loading,
            workspaceName,
            debugger: dbugger,
            clipboard,
            searchResults,
            automationType,
            automationReport,
            fileInterfaceMap,
            packageMap,
            triggers,
            triggerGroups, triggerMap,
            commandGroups, commandMap, commandProperties,
            iteratorGroups, iteratorMap,
            conditionalGroups, conditionalMap,
            exceptionGroups, exceptionMap,
            nodes, onNodeChange,
            globalValues, taskAliases, variableGroups, variableMap, variables,
            breakpoints, onBreakpointsChange,
            cursor, onCursorChange,
            collapsed, onCollapsedChange,
            sizes, onResize,
            opened, onOpenedChange,
            onDragOver, onDrop,
            onNodeDragStart, onNodeDragEnd, onNodeDragOver,
            onNodeCopy, onNodeCut, onNodePaste, onNodeDelete,
            draggingFrom, draggingTo, draggingType,
            onNodeRunFrom,
            onAddSuggestions,
            onAppendItem,
            newNodeUid,
            isPrinting,
            t,
        } = this.props;
        const {visibleUids} = this.state;

        const validNodes = nodes.filter((node) => mode === 'debug'
            ? node && node.uid && !node.disabled
            : node && node.uid,
        );
        const hasNodes = validNodes.length > 0;
        const hasTriggers = triggers.length > 0;
        const showTriggers = hasTriggers && mode !== 'debug' || triggerGroups?.length > 0 && mode === 'edit';
        const lineNumbers = this.selectLineNumbers(this.props);
        const cursorParentUids = this.selectCursorParentUids(this.props);

        const hasRootNode = getObject(validNodes?.at(0), commandMap)?.root === true;
        const hasLeafNode = getObject(validNodes?.at(-1), commandMap)?.leaf === true;

        return (
            <div data-dragging={draggingType ? '' : null}>
                <div
                    ref={this.rootRef}
                    className={classnames('taskbot-canvas-list', {
                        'taskbot-canvas-list--printing': isPrinting,
                    }, 'g-scroller')}
                    onScroll={this.handleScroll}
                >
                    <div
                        ref={this.editorRef}
                        className={classnames('taskbot-canvas-list__editor', {
                            'taskbot-canvas-list__editor--editable': mode === 'edit',
                            'taskbot-canvas-list__editor--debugging': mode === 'debug',
                            'taskbot-canvas-list__editor--empty': !hasNodes && !hasTriggers,
                        })}
                        style={!hasNodes ? null : lineNumbers.editorStyle}
                        onClick={this.handleClick}
                    >
                        {showTriggers ? (
                            <>
                                <div className="taskbot-canvas-list__title taskbot-canvas-list__title--icon">
                                    <div className="taskbot-canvas-list__title-icon taskbot-canvas-list__title-icon--triggers">
                                        <Icon
                                            aa="misc-editor-trigger"
                                            block
                                        />
                                    </div>
                                    {t('taskbot:node-triggers')}
                                </div>
                                <div className="taskbot-canvas-list__editor-nodes">
                                    {!hasTriggers ? (
                                        <div
                                            className={classnames('taskbot-canvas-list__editor-empty', {
                                                'taskbot-canvas-list__editor-empty--dragging': draggingTo && draggingTo.position !== POSITION_NONE && draggingType === NODE_TYPE_TRIGGER,
                                            })}
                                            onDragEnter={onDragOver ? this.handleDragOverTriggers : null}
                                            onDragOver={onDragOver ? this.handleDragOverTriggers : null}
                                            onDrop={onDrop}
                                        >
                                            <span>
                                                {t(mode === 'edit' ? 'taskbot:code-trigger-empty-edit-help' : 'taskbot:code-trigger-empty-view-help')}
                                            </span>
                                        </div>
                                    ) : null}
                                    {hasTriggers && triggers.map((node, nodeIndex, nodes) => (
                                        <TaskbotCanvasListNode
                                            key={node.uid}
                                            isLoading={loading}
                                            workspaceName={workspaceName}
                                            searchResults={searchResults}
                                            automationType={automationType}
                                            automationReport={automationReport}
                                            nodeType={NODE_TYPE_TRIGGER}
                                            depth={0}
                                            branch={false}
                                            lastBranch={false}
                                            lineNumbers={lineNumbers}
                                            mode={mode}
                                            debugger={dbugger}
                                            node={node}
                                            nodeBefore={nodes[nodeIndex - 1]}
                                            nodeAfter={nodes[nodeIndex + 1]}
                                            nodeParents={null}
                                            clipboard={clipboard}
                                            fileInterfaceMap={fileInterfaceMap}
                                            onNodeChange={onNodeChange}
                                            cursor={cursor}
                                            onCursorChange={onCursorChange}
                                            collapsed={collapsed}
                                            onCollapsedChange={onCollapsedChange}
                                            sizes={sizes}
                                            onResize={onResize}
                                            opened={opened}
                                            onOpenedChange={onOpenedChange}
                                            globalValues={globalValues}
                                            variableGroups={variableGroups}
                                            variableMap={variableMap}
                                            variables={variables}
                                            breakpoints={breakpoints}
                                            onBreakpointsChange={onBreakpointsChange}
                                            packageMap={packageMap}
                                            commandGroups={triggerGroups}
                                            commandMap={triggerMap}
                                            iteratorGroups={iteratorGroups}
                                            iteratorMap={iteratorMap}
                                            conditionalGroups={conditionalGroups}
                                            conditionalMap={conditionalMap}
                                            triggerMap={triggerMap}
                                            triggerGroups={triggerGroups}
                                            exceptionGroups={exceptionGroups}
                                            exceptionMap={exceptionMap}
                                            draggingFrom={draggingFrom}
                                            draggingTo={draggingTo}
                                            onDrop={onDrop}
                                            onNodeDragStart={onNodeDragStart}
                                            onNodeDragEnd={onNodeDragEnd}
                                            onNodeDragOver={onNodeDragOver}
                                            onNodeCopy={onNodeCopy}
                                            onNodeCut={onNodeCut}
                                            onNodePaste={onNodePaste}
                                            onNodeDelete={onNodeDelete}
                                            newNodeUid={newNodeUid}
                                            visibleUids={visibleUids}
                                            cursorParentUids={cursorParentUids}
                                            isPrinting={isPrinting}
                                            t={t}
                                        />
                                    ))}
                                    {hasTriggers && onDragOver && onDrop ? (
                                        <div
                                            className={classnames('taskbot-canvas-list__dropzone', 'taskbot-canvas-list__dropzone--last', {
                                                'taskbot-canvas-list__dropzone--active': draggingTo && draggingTo.position === POSITION_END && draggingType === NODE_TYPE_TRIGGER,
                                            })}
                                            onDragEnter={this.handleDragOverTriggers}
                                            onDragOver={this.handleDragOverTriggers}
                                            onDrop={onDrop}
                                        >
                                            <div className="taskbot-canvas-list__dropzone-indicator"/>
                                        </div>
                                    ) : null}
                                </div>
                            </>
                        ) : null}
                        {!hasRootNode ? (
                            <div className="taskbot-canvas-list__title taskbot-canvas-list__title--icon">
                                <div className="taskbot-canvas-list__title-icon taskbot-canvas-list__title-icon--start">
                                    <RioIcon iconName="play-triangle"/>
                                </div>
                                {t('taskbot:node-start')}
                            </div>
                        ) : null}
                        <div className="taskbot-canvas-list__editor-nodes">
                            {!hasNodes ? (
                                <div
                                    className={classnames('taskbot-canvas-list__editor-empty', {
                                        'taskbot-canvas-list__editor-empty--dragging': draggingTo && draggingTo.position !== POSITION_NONE && draggingType === NODE_TYPE_COMMAND,
                                    })}
                                    onDragEnter={onDragOver ? this.handleDragOverCommands : null}
                                    onDragOver={onDragOver ? this.handleDragOverCommands : null}
                                    onDrop={onDrop}
                                >
                                    <span>
                                        {t(mode === 'edit' ? 'taskbot:code-action-empty-edit-help' : 'taskbot:code-action-empty-view-help')}
                                    </span>
                                    {mode === 'edit' && !(draggingTo && draggingTo.position !== POSITION_NONE && draggingType === NODE_TYPE_COMMAND) && (
                                        <TaskbotNodeQuickAdd
                                            mode={mode}
                                            view={KEY_CANVAS_LIST}
                                            automationType={automationType}
                                            nodes={nodes}
                                            node={null}
                                            nodeType={NODE_TYPE_COMMAND}
                                            lineNumber={null}
                                            collapsed={collapsed}
                                            command={null}
                                            commandMap={commandMap}
                                            packageMap={packageMap}
                                            iteratorMap={iteratorMap}
                                            conditionalMap={conditionalMap}
                                            triggerMap={triggerMap}
                                            exceptionMap={exceptionMap}
                                            fileInterfaceMap={fileInterfaceMap}
                                            variables={variables}
                                            globalValues={globalValues}
                                            commandGroups={commandGroups}
                                            onAppendItem={onAppendItem}
                                            onAddSuggestions={onAddSuggestions}
                                        />
                                    )}
                                </div>
                            ) : null}
                            {hasNodes && validNodes.map((node, nodeIndex, nodes) => (
                                <TaskbotCanvasListNode
                                    key={node.uid}
                                    isLoading={loading}
                                    workspaceName={workspaceName}
                                    searchResults={searchResults}
                                    automationType={automationType}
                                    automationReport={automationReport}
                                    nodeType={NODE_TYPE_COMMAND}
                                    depth={0}
                                    branch={false}
                                    canRunFrom
                                    lastBranch={false}
                                    lineNumbers={lineNumbers}
                                    mode={mode}
                                    debugger={dbugger}
                                    node={node}
                                    nodeBefore={nodes[nodeIndex - 1]}
                                    nodeAfter={nodes[nodeIndex + 1]}
                                    nodeParents={null}
                                    fileInterfaceMap={fileInterfaceMap}
                                    clipboard={clipboard}
                                    onNodeChange={onNodeChange}
                                    cursor={cursor}
                                    onCursorChange={onCursorChange}
                                    collapsed={collapsed}
                                    onCollapsedChange={onCollapsedChange}
                                    sizes={sizes}
                                    onResize={onResize}
                                    opened={opened}
                                    onOpenedChange={onOpenedChange}
                                    globalValues={globalValues}
                                    taskAliases={taskAliases}
                                    variableGroups={variableGroups}
                                    variableMap={variableMap}
                                    variables={variables}
                                    breakpoints={breakpoints}
                                    onBreakpointsChange={onBreakpointsChange}
                                    packageMap={packageMap}
                                    commandGroups={commandGroups}
                                    commandMap={commandMap}
                                    commandProperties={commandProperties}
                                    iteratorGroups={iteratorGroups}
                                    iteratorMap={iteratorMap}
                                    conditionalGroups={conditionalGroups}
                                    conditionalMap={conditionalMap}
                                    triggerMap={triggerMap}
                                    triggerGroups={triggerGroups}
                                    exceptionGroups={exceptionGroups}
                                    exceptionMap={exceptionMap}
                                    draggingFrom={draggingFrom}
                                    draggingTo={draggingTo}
                                    onDrop={onDrop}
                                    onNodeDragStart={onNodeDragStart}
                                    onNodeDragEnd={onNodeDragEnd}
                                    onNodeDragOver={onNodeDragOver}
                                    onNodeCopy={onNodeCopy}
                                    onNodeCut={onNodeCut}
                                    onNodePaste={onNodePaste}
                                    onNodeDelete={onNodeDelete}
                                    onNodeRunFrom={onNodeRunFrom}
                                    newNodeUid={newNodeUid}
                                    visibleUids={visibleUids}
                                    cursorParentUids={cursorParentUids}
                                    isPrinting={isPrinting}
                                    nodes={nodes}
                                    onAddSuggestions={onAddSuggestions}
                                    onAppendItem={onAppendItem}
                                    t={t}
                                />
                            ))}
                            {hasNodes && onDragOver && onDrop && !hasLeafNode ? (
                                <div
                                    className={classnames('taskbot-canvas-list__dropzone', 'taskbot-canvas-list__dropzone--last', {
                                        'taskbot-canvas-list__dropzone--active': draggingTo && draggingTo.position === POSITION_END && draggingType === NODE_TYPE_COMMAND,
                                    })}
                                    onDragEnter={this.handleDragOverCommands}
                                    onDragOver={this.handleDragOverCommands}
                                    onDrop={onDrop}
                                >
                                    <div className="taskbot-canvas-list__dropzone-indicator"/>
                                </div>
                            ) : null}
                        </div>
                        {!hasLeafNode ? (
                            <div className="taskbot-canvas-list__title taskbot-canvas-list__title--icon">
                                <div className="taskbot-canvas-list__title-icon taskbot-canvas-list__title-icon--end">
                                    <RioIcon iconName="square"/>
                                </div>
                                {t('taskbot:node-end')}
                            </div>
                        ) : null}
                    </div>
                </div>
                {onDragOver ? (
                    <>
                        <div
                            className="taskbot-canvas-list__scroller-dropzone taskbot-canvas-list__scroller-dropzone--top"
                            onDragEnter={(event) => this.handleDragScroll(event, -1)}
                            onDragOver={(event) => this.handleDragScroll(event, -1)}
                            onDragExit={() => {
                                this.dragScrollCallback = null;
                            }}
                            onDrop={() => {
                                this.dragScrollCallback = null;
                                if (onNodeDragEnd) {
                                    onNodeDragEnd();
                                }
                            }}
                        />
                        <div
                            className="taskbot-canvas-list__scroller-dropzone taskbot-canvas-list__scroller-dropzone--bottom"
                            onDragEnter={(event) => this.handleDragScroll(event, 1)}
                            onDragOver={(event) => this.handleDragScroll(event, 1)}
                            onDragExit={() => {
                                this.dragScrollCallback = null;
                            }}
                            onDrop={() => {
                                this.dragScrollCallback = null;
                                if (onNodeDragEnd) {
                                    onNodeDragEnd();
                                }
                            }}
                        />
                    </>
                ) : null}
            </div>
        );
    }
}


export {TaskbotCanvasList};
