/**
 * Copyright (c) 2020 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import React, {PureComponent, createRef} from 'react';
import {createSelector} from 'reselect';
import classnames from 'classnames';
import {
    ActionBar, CheapSet,
    CommandButton,
    getEventKey, getEventHasExactModifierKeys,
    addEventListener, removeEventListener, addFrameEventListener, removeFrameEventListener,
} from '@automationanywhere/rio-components';

import {getNodeNieghbors, KEY_CANVAS_FLOW, KEY_CANVAS_LIST} from '../utils/nodes';
import {CREATE_SELECTOR_EFFECT_OPTIONS, CREATE_SELECTOR_IS_EQUAL_OPTIONS} from '../../../util/reselect';

import {buildLayout, LAYOUT_SIZE_SMALL, LAYOUT_SIZE_LARGE, LAYOUT_POINT_NODE, LAYOUT_POINT_TRIGGER, LAYOUT_POINT_CONTAINER, LAYOUT_POINT_END, LAYOUT_POINT_TRIGGERS, LAYOUT_POINT_START} from './layout';
import {TaskbotCanvasFlowPoint} from './Point';
import {TaskbotCanvasFlowBackground} from './Background';

import './TaskbotCanvasFlow.scss';

const LINE_HARD_MAXIMUM = 5000;
const LINE_SOFT_MAXIMUM = 1000;

const DEFAULT_PANZOOM = {top: 0, left: 0, zoom: 100};

const MOUSE_SCROLL_PAN = 64;

const DRAG_SCROLL_PAN_X = 64;
const DRAG_SCROLL_PAN_Y = 128;

const ZOOM_LEVELS = [8, 12, 17, 23, 30, 38, 47, 57, 68, 86, 100];
const ZOOM_LEVELS_REVERSE = [...ZOOM_LEVELS].reverse();
const ZOOM_MINIMUM = ZOOM_LEVELS[0];
const ZOOM_MAXIMUM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

const STROKE_LEVELS = [15, 12, 9, 6, 5, 4, 4, 3, 3, 2, 2];

const INTERVAL_PANZOOM = 50;

const EVENT_TYPE_MOUSE = 'MOUSE';
const EVENT_TYPE_TOUCH = 'TOUCH';

const getEventY = (event, eventType) => {
    switch (eventType) {
        case EVENT_TYPE_MOUSE:
            return event.clientY;
        case EVENT_TYPE_TOUCH:
            if (event.touches) {
                return event.touches[0].pageY;
            }
    }
    return 0;
};

const getEventX = (event, eventType) => {
    switch (eventType) {
        case EVENT_TYPE_MOUSE:
            return event.clientX;
        case EVENT_TYPE_TOUCH:
            if (event.touches) {
                return event.touches[0].pageX;
            }
    }
    return 0;
};

class TaskbotCanvasFlow extends PureComponent {
    static displayName = 'TaskbotCanvasFlow';

    constructor(props) {
        super(props);

        this.rootRef = createRef();
        this.layoutRef = createRef();
        this.backgroundRef = createRef();
        this.pointsRef = createRef();

        this.dragScrollCallback = null;
        this.dragScrollTimeout = 0;

        const selectTriggers = (props) => {
            const {mode, triggers, triggerGroups} = props;

            const hasTriggers = triggers.length > 0;
            const showTriggers = hasTriggers && mode !== 'debug' || triggerGroups?.length > 0 && mode === 'edit';

            return showTriggers ? triggers : null;
        };

        this.selectLayout = createSelector(
            selectTriggers,
            (props) => props.nodes,
            (props) => props.triggerMap,
            (props) => props.commandMap,
            (props) => props.collapsed,
            (props) => props.mode !== 'debug',
            buildLayout,
        );

        const canvasSize = createSelector(
            () => {
                const layoutRect = this.layoutRef.current?.getBoundingClientRect();
                return !layoutRect
                    ? {
                        width: 0,
                        height: 0,
                    }
                    : {
                        width: Math.floor(layoutRect.width),
                        height: Math.floor(layoutRect.height),
                    };
            },
            (size) => size,
            CREATE_SELECTOR_IS_EQUAL_OPTIONS,
        );

        this.selectDraggingTo = createSelector(
            (props) => props.draggingTo,
            (draggingTo) => draggingTo,
            CREATE_SELECTOR_IS_EQUAL_OPTIONS,
        );

        this.selectPanZoom = createSelector(
            (props, state) => state.panZoom || props.panZoom || DEFAULT_PANZOOM,
            this.selectLayout,
            canvasSize,
            (panZoom, layout, canvasSize) => {
                const {top, left, zoom} = panZoom;

                let nextTop = Math.max(top, 100 - (zoom / 100 * layout.bounds.height));
                if (canvasSize.height) {
                    nextTop = Math.min(nextTop, canvasSize.height - 100);
                }
                nextTop = Math.floor(nextTop);

                let nextLeft = Math.max(left, 100 - (zoom / 100 * layout.bounds.width));
                if (canvasSize.width) {
                    nextLeft = Math.min(nextLeft, canvasSize.width - 100);
                }
                nextLeft = Math.floor(nextLeft);

                return top !== nextTop || left !== nextLeft ? {top: nextTop, left: nextLeft, zoom} : panZoom;
            },
        );


        const selectZoomLevelIndex = createSelector(
            this.selectPanZoom,
            (panZoom) => ZOOM_LEVELS.findIndex((z) => z >= panZoom.zoom),
        );

        this.selectStrokeWidth = createSelector(
            selectZoomLevelIndex,
            (index) => STROKE_LEVELS[index] || STROKE_LEVELS[STROKE_LEVELS.length - 1],
        );

        this.selectFlowStyle = createSelector(
            this.selectLayout,
            this.selectPanZoom,
            (props, state) => state.scrolling,
            (layout, panZoom, scrolling) => {
                const scale = panZoom.zoom / 100;
                const height = layout.bounds.height - layout.bounds.y;
                const width = layout.bounds.width - layout.bounds.x;
                let top = panZoom.top + layout.bounds.y * scale;
                let left = panZoom.left + layout.bounds.x * scale;
                if (scale < 1) {
                    top -= (height - (height * scale)) / 2;
                    left -= (width - (width * scale)) / 2;
                }
                return {
                    height,
                    width,
                    top,
                    left,
                    transform: `scale(${scale})`,
                    transition: scrolling ? `top ${INTERVAL_PANZOOM}ms linear, left ${INTERVAL_PANZOOM}ms linear` : null,
                };
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

        let firstCanvasRender = true;
        this.canvasTimeout = 0;
        this.selectCanvasRect = createSelector(
            this.selectPanZoom,
            canvasSize,
            (panZoom, canvasSize) => {
                const canvasRect = {};
                if (panZoom.zoom < 100) {
                    const scale = panZoom.zoom / 100;
                    canvasRect.top = -panZoom.top / scale;
                    canvasRect.bottom = canvasRect.top + canvasSize.height / scale;
                    canvasRect.left = -panZoom.left / scale;
                    canvasRect.right = canvasRect.left + canvasSize.width / scale;
                    canvasRect.padding = 100 / scale;
                }
                else {
                    canvasRect.top = -panZoom.top;
                    canvasRect.bottom = canvasRect.top + canvasSize.height;
                    canvasRect.left = -panZoom.left;
                    canvasRect.right = canvasRect.left + canvasSize.width;
                    canvasRect.padding = 100;
                }
                canvasRect.height = canvasRect.bottom - canvasRect.top;
                canvasRect.width = canvasRect.right - canvasRect.left;

                if (!canvasRect.height || !canvasRect.width) {
                    return;
                }

                if (firstCanvasRender) {
                    firstCanvasRender = false;
                    setTimeout(() => {
                        this.setState({canvasRect});
                    });
                    return;
                }

                clearTimeout(this.canvasTimeout);
                this.canvasTimeout = setTimeout(() => {
                    this.canvasTimeout = 0;
                    this.setState({canvasRect});
                }, this.canvasTimeout ? 250 : 50);
            },
            CREATE_SELECTOR_EFFECT_OPTIONS,
        );

        this.lastCount = 0;

        this.state = {
            canvasRect: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                height: 0,
                width: 0,
            },

            panZoom: null,
            panning: false,

            showBanner: true,

            dirty: 0,
        };
    }

    calculateScrollToNode(cursorUid) {
        if (!cursorUid) {
            return;
        }

        const {onPanZoomChange} = this.props;
        if (!onPanZoomChange) {
            return;
        }

        const layoutElement = this.layoutRef.current;
        if (!layoutElement) {
            return;
        }

        const layout = this.selectLayout(this.props);
        const point = layout.points.find((point) => point.key === cursorUid);
        if (!point) {
            return;
        }

        const panZoom = this.selectPanZoom(this.props, this.state);
        const scale = panZoom.zoom / 100;
        const pointTop = (point.y - layout.bounds.y) * scale + panZoom.top;
        const pointBottom = pointTop + (point.height) * scale;
        const pointLeft = (point.x - layout.bounds.x) * scale + panZoom.left;
        const pointRight = pointLeft + (point.width) * scale;
        const {offsetHeight: containerHeight, offsetWidth: containerWidth} = layoutElement;
        let {top, left} = panZoom;
        if (pointTop < -24) {
            top -= pointTop - 24;
        }
        else if (pointBottom > containerHeight + 32) {
            top -= pointBottom - containerHeight + 32;
        }

        if (pointLeft < -16) {
            left -= pointLeft - 16;
        }
        else if (pointRight > containerWidth - 16) {
            left -= pointRight - containerWidth - 16;
        }
        onPanZoomChange({...panZoom, top, left});
    }

    handleDragBackground = (event) => {
        event.preventDefault();
        const {onDragOver} = this.props;
        if (onDragOver) {
            onDragOver(event);
        }
    };

    handleDragScroll = (event, deltaX, deltaY) => {
        event.stopPropagation();
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'none';
        }
        const {onDragOver, onPanZoomChange} = this.props;
        if (onDragOver) {
            onDragOver(event);
        }
        this.dragScrollCallback = () => {
            this.dragScrollTimeout = 0;
            this.dragScrollCallback = null;
            if (onPanZoomChange) {
                const panZoom = this.selectPanZoom(this.props, this.state);
                onPanZoomChange({
                    ...panZoom,
                    left: panZoom.left + deltaX * DRAG_SCROLL_PAN_X,
                    top: panZoom.top + deltaY * DRAG_SCROLL_PAN_Y,
                });
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

    handlePanStartMouse = (event) => {
        this.handlePanStart(event, EVENT_TYPE_MOUSE);
    };

    handlePanStartTouch = (event) => {
        this.handlePanStart(event, EVENT_TYPE_TOUCH);
    };

    handlePanStart = (event, eventType) => {
        if (!this._isMounted) {
            return;
        }

        const root = this.rootRef.current;
        if (!root) {
            return;
        }

        const background = this.backgroundRef.current;
        const points = this.pointsRef.current;
        if (event.target !== background && event.target !== points) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();
        if (eventType === EVENT_TYPE_TOUCH && (!event.touches || event.touches.length !== 1)) {
            return;
        }

        const {cursor, onPanZoomChange, onCursorChange} = this.props;
        if (!onPanZoomChange) {
            return;
        }

        let moved = false;
        const startY = getEventY(event, eventType);
        const startX = getEventX(event, eventType);
        const startPanZoom = this.selectPanZoom(this.props, this.state);
        let currentPanZoom = startPanZoom;
        const updateInterval = setInterval(() => {
            if (!this._isMounted) {
                clearInterval(this.intervalWheel);
                return;
            }

            const {panZoom} = this.state;
            if (!panZoom || panZoom.top !== currentPanZoom.top || panZoom.left !== currentPanZoom.left || panZoom.zoom !== currentPanZoom.zoom) {
                this.setState({panZoom: currentPanZoom});
            }
        }, INTERVAL_PANZOOM);
        this.setState({panning: true});
        clearTimeout(this.transitionTimeout);
        root.setAttribute('transition', '');
        const handleMove = (event) => {
            const deltaY = startY - getEventY(event, eventType);
            const deltaX = startX - getEventX(event, eventType);
            if (deltaY || deltaX) {
                moved = true;
            }
            currentPanZoom = {
                top: Math.floor(startPanZoom.top - deltaY),
                left: Math.floor(startPanZoom.left - deltaX),
                zoom: startPanZoom.zoom,
            };
            event.stopPropagation();
            event.preventDefault();
            return false;
        };
        const handleEnd = (event) => {
            if (!moved && cursor && onCursorChange) {
                onCursorChange(null);
            }

            clearInterval(updateInterval);
            const {panZoom} = this.state;
            if (panZoom) {
                this.setState({panZoom: null, panning: false}, () => onPanZoomChange(panZoom));
            }
            else {
                this.setState({panning: false});
            }
            root.removeAttribute('transition');
            switch (eventType) {
                case EVENT_TYPE_MOUSE:
                    window.removeEventListener('mousemove', handleMove, true);
                    window.removeEventListener('mouseup', handleEnd, true);
                    break;
                case EVENT_TYPE_TOUCH:
                    window.removeEventListener('touchmove', handleMove, true);
                    window.removeEventListener('touchend', handleEnd, true);
                    window.removeEventListener('touchleave', handleEnd, true);
                    window.removeEventListener('touchcancel', handleEnd, true);
                    break;
            }
            event.stopPropagation();
            event.preventDefault();
            return false;
        };
        switch (eventType) {
            case EVENT_TYPE_MOUSE:
                window.addEventListener('mousemove', handleMove, true);
                window.addEventListener('mouseup', handleEnd, true);
                break;
            case EVENT_TYPE_TOUCH:
                window.addEventListener('touchmove', handleMove, true);
                window.addEventListener('touchend', handleEnd, true);
                window.addEventListener('touchleave', handleEnd, true);
                window.addEventListener('touchcancel', handleEnd, true);
                break;
        }
        if (document.activeElement) {
            document.activeElement.blur();
        }
    };

    handleZoomWheel = (event) => {
        if (!this._isMounted) {
            return;
        }

        if (this.state.panZoom) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        const hasNoKey = getEventHasExactModifierKeys(event, {});
        const hasShiftKey = getEventHasExactModifierKeys(event, {shiftKey: true});
        const hasCtrlKey = getEventHasExactModifierKeys(event, {ctrlKey: true});

        if (hasNoKey || hasShiftKey) {
            const {deltaY, deltaX} = event;
            this.callbackWheel = () => {
                const {panZoom, onPanZoomChange} = this.props;
                const nextPanZoom = {...panZoom};
                if (deltaY) {
                    if (deltaX === 0 && hasShiftKey) {
                        nextPanZoom.left += deltaY > 0 ? -MOUSE_SCROLL_PAN : MOUSE_SCROLL_PAN;
                    }
                    else {
                        nextPanZoom.top += deltaY > 0 ? -MOUSE_SCROLL_PAN : MOUSE_SCROLL_PAN;
                    }
                }
                if (deltaX) {
                    nextPanZoom.left += deltaX > 0 ? -MOUSE_SCROLL_PAN : MOUSE_SCROLL_PAN;
                }
                onPanZoomChange(nextPanZoom);
            };
            if (this.intervalWheel) {
                return;
            }

            this.setState({scrolling: true}, () => {
                if (this.callbackWheel) {
                    this.callbackWheel();
                }
                this.callbackWheel = null;
                this.intervalWheel = setInterval(() => {
                    if (!this._isMounted) {
                        clearInterval(this.intervalWheel);
                        this.intervalWheel = null;
                        this.setState({scrolling: false});
                        return;
                    }

                    const callback = this.callbackWheel;
                    if (!callback) {
                        clearInterval(this.intervalWheel);
                        this.intervalWheel = null;
                        this.setState({scrolling: false});
                        return;
                    }

                    this.callbackWheel = null;
                    callback();
                }, INTERVAL_PANZOOM);
            });
            return;
        }

        if (!hasCtrlKey) {
            return;
        }

        if (event.deltaY < 0) {
            event.preventDefault();
            event.stopPropagation();
            const wheelEvent = {
                type: event.type,
                clientY: event.clientY,
                clientX: event.clientX,
            };
            this.callbackWheel = () => {
                this.handleZoomIn(wheelEvent);
            };
        }
        else if (event.deltaY > 0) {
            event.preventDefault();
            event.stopPropagation();
            const wheelEvent = {
                type: event.type,
                clientY: event.clientY,
                clientX: event.clientX,
            };
            this.callbackWheel = () => {
                this.handleZoomOut(wheelEvent);
            };
        }
        else {
            return;
        }

        if (this.intervalWheel) {
            return;
        }

        if (this.callbackWheel) {
            this.callbackWheel();
        }
        this.callbackWheel = null;
        this.intervalWheel = setInterval(() => {
            if (!this._isMounted) {
                clearInterval(this.intervalWheel);
                this.intervalWheel = null;
                return;
            }

            const callback = this.callbackWheel;
            if (!callback) {
                clearInterval(this.intervalWheel);
                this.intervalWheel = null;
                return;
            }

            this.callbackWheel = null;
            callback();
        }, INTERVAL_PANZOOM);
    };

    handleZoomIn = (event) => {
        if (!this._isMounted) {
            return;
        }

        const {onPanZoomChange} = this.props;
        if (!onPanZoomChange) {
            return;
        }

        let {panZoom} = this.props;
        if (!panZoom) {
            panZoom = DEFAULT_PANZOOM;
        }
        let {top, left, zoom} = panZoom;
        let nearestIndex = ZOOM_LEVELS_REVERSE.findIndex((z) => z <= zoom);
        if (nearestIndex === -1) {
            nearestIndex = 0;
        }
        else {
            nearestIndex = ZOOM_LEVELS.length - nearestIndex - 1;
        }
        zoom = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, nearestIndex + 1)];
        if (zoom === panZoom.zoom) {
            return;
        }

        if (event && event.type === 'wheel') {
            [top, left] = this.handleZoomPanOrient(event, panZoom, zoom);
        }
        onPanZoomChange({top, left, zoom});
    };

    handleZoomOut = (event) => {
        if (!this._isMounted) {
            return;
        }

        const {onPanZoomChange} = this.props;
        if (!onPanZoomChange) {
            return;
        }

        let {panZoom} = this.props;
        if (!panZoom) {
            panZoom = DEFAULT_PANZOOM;
        }
        let {top, left, zoom} = panZoom;
        let nearestIndex = ZOOM_LEVELS.findIndex((z) => z >= zoom);
        if (nearestIndex === -1) {
            nearestIndex = ZOOM_LEVELS.length;
        }
        zoom = ZOOM_LEVELS[Math.max(0, nearestIndex - 1)];
        if (zoom === panZoom.zoom) {
            return;
        }

        if (event && event.type === 'wheel') {
            [top, left] = this.handleZoomPanOrient(event, panZoom, zoom);
        }
        onPanZoomChange({top, left, zoom});
    };

    // Pan so we stay oriented on mouse pointer
    handleZoomPanOrient(event, panZoom, nextZoom) {
        let {top, left} = panZoom;
        const layoutElement = this.layoutRef.current;
        if (!layoutElement) {
            return [top, left];
        }

        const {top: layoutTop, left: layoutLeft} = layoutElement.getBoundingClientRect();
        const mouseY = event.clientY - layoutTop;
        const mouseX = event.clientX - layoutLeft;
        const deltaY = mouseY - top;
        const deltaX = mouseX - left;

        const nextRatio = (nextZoom / 100) / (panZoom.zoom / 100);
        const nextDeltaY = deltaY * nextRatio;
        const nextDeltaX = deltaX * nextRatio;

        top = -(nextDeltaY - mouseY);
        left = -(nextDeltaX - mouseX);

        return [top, left];
    }

    handleZoomFit = () => {
        if (!this._isMounted) {
            return;
        }

        const root = this.rootRef.current;
        const layoutElement = this.layoutRef.current;
        if (!root || !layoutElement) {
            return;
        }

        const {panZoom, onPanZoomChange} = this.props;
        if (!onPanZoomChange) {
            return;
        }

        const {bounds} = this.selectLayout(this.props);
        const {offsetHeight: containerHeight, offsetWidth: containerWidth} = layoutElement;
        const boundsHeight = bounds.height - bounds.y;
        const boundsWidth = bounds.width - bounds.x;
        const scale = Math.min(containerHeight / boundsHeight, containerWidth / boundsWidth);
        const nextPanZoom = {
            zoom: Math.min(ZOOM_MAXIMUM, Math.max(ZOOM_MINIMUM, scale * 100 || 0)),
            top: 0,
            left: 0,
        };
        const nextPanScale = nextPanZoom.zoom / 100;
        const scaleWidth = boundsWidth * nextPanScale;
        if (scaleWidth <= containerWidth) {
            const scaleBoundsX = bounds.x * nextPanScale;
            nextPanZoom.left = Math.floor((containerWidth - scaleWidth) / 2 - scaleBoundsX);
        }
        if (panZoom && panZoom.zoom === nextPanZoom.zoom && panZoom.top === nextPanZoom.top && panZoom.left === nextPanZoom.left) {
            return;
        }

        clearTimeout(this.transitionTimeout);
        onPanZoomChange(nextPanZoom);
    };

    handleKeyDown = (event) => {
        if (!this._isMounted) {
            return;
        }

        const {active, cursor} = this.props;
        if (!active || cursor?.view !== KEY_CANVAS_FLOW) {
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
            case 'ArrowLeft': {
                event.preventDefault();
                event.stopPropagation();
                const {mode, triggerMap, commandMap, triggers, nodes, collapsed, onCursorChange} = this.props;
                if (!onCursorChange) {
                    return;
                }

                const {west} = getNodeNieghbors(triggerMap, commandMap, triggers, nodes, (node) => node.uid === cursor.uid, collapsed, mode, KEY_CANVAS_FLOW);
                if (!west) {
                    return;
                }

                const uid = west.uid;
                if (cursor && hasShiftKey) {
                    const uids = cursor.uids || new CheapSet();
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids: uids.clone(), view: KEY_CANVAS_FLOW});
                    return;
                }

                if (cursor && cursor.uids && (cursor.uid === uid || cursor.uids.has(uid))) {
                    const uids = cursor.uids;
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids, view: KEY_CANVAS_FLOW});
                    return;
                }

                onCursorChange({uid, view: KEY_CANVAS_FLOW});
                break;
            }

            case 'ArrowUp': {
                event.preventDefault();
                event.stopPropagation();
                const {mode, triggerMap, commandMap, triggers, nodes, collapsed, onCursorChange} = this.props;
                if (!onCursorChange) {
                    return;
                }

                const {north} = getNodeNieghbors(triggerMap, commandMap, triggers, nodes, (node) => node.uid === cursor.uid, collapsed, mode, KEY_CANVAS_FLOW);
                if (!north) {
                    return;
                }

                const uid = north.uid;
                if (cursor && hasShiftKey) {
                    const uids = cursor.uids || new CheapSet();
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids: uids.clone(), view: KEY_CANVAS_FLOW});
                    return;
                }

                if (cursor && cursor.uids && (cursor.uid === uid || cursor.uids.has(uid))) {
                    const uids = cursor.uids;
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids, view: KEY_CANVAS_FLOW});
                    return;
                }

                onCursorChange({uid, view: KEY_CANVAS_FLOW});
                break;
            }
            case 'ArrowRight': {
                event.preventDefault();
                event.stopPropagation();
                const {mode, triggerMap, commandMap, triggers, nodes, collapsed, onCursorChange} = this.props;
                if (!onCursorChange) {
                    return;
                }

                const {east} = getNodeNieghbors(triggerMap, commandMap, triggers, nodes, (node) => node.uid === cursor.uid, collapsed, mode, KEY_CANVAS_FLOW);
                if (!east) {
                    return;
                }

                const uid = east.uid;
                if (cursor && hasShiftKey) {
                    const uids = cursor.uids || new CheapSet();
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids: uids.clone(), view: KEY_CANVAS_FLOW});
                    return;
                }

                if (cursor && cursor.uids && (cursor.uid === uid || cursor.uids.has(uid))) {
                    const uids = cursor.uids;
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids, view: KEY_CANVAS_FLOW});
                    return;
                }

                onCursorChange({uid, view: KEY_CANVAS_FLOW});
                break;
            }
            case 'ArrowDown': {
                event.preventDefault();
                event.stopPropagation();
                const {mode, triggerMap, commandMap, triggers, nodes, collapsed, onCursorChange} = this.props;
                if (!onCursorChange) {
                    return;
                }

                const {south} = getNodeNieghbors(triggerMap, commandMap, triggers, nodes, (node) => node.uid === cursor.uid, collapsed, mode, KEY_CANVAS_FLOW);
                if (!south) {
                    return;
                }

                const uid = south.uid;
                if (cursor && hasShiftKey) {
                    const uids = cursor.uids || new CheapSet();
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids: uids.clone(), view: KEY_CANVAS_FLOW});
                    return;
                }

                if (cursor && cursor.uids && (cursor.uid === uid || cursor.uids.has(uid))) {
                    const uids = cursor.uids;
                    uids.add(cursor.uid);
                    onCursorChange({uid, uids, view: KEY_CANVAS_FLOW});
                    return;
                }

                onCursorChange({uid, view: KEY_CANVAS_FLOW});
                break;
            }
        }
    };

    checkWidth = () => {
        clearTimeout(this.updateTimeout);
        const nextWidth = this.layoutRef.current?.offsetWidth ?? 0;
        if (nextWidth !== this.lastWidth) {
            this.updateTimeout = setTimeout(() => {
                this.lastWidth = nextWidth;
                this.setState(({dirty}) => ({dirty: dirty + 1}));
            }, 50);
        }
    };

    componentDidMount() {
        this._isMounted = true;
        const {panZoom, onPanZoomChange} = this.props;
        if (!panZoom && onPanZoomChange) {
            onPanZoomChange({
                top: 0,
                left: 0,
                zoom: 100,
            });
        }
        this.selectCursor(this.props);
        this.selectCanvasRect(this.props, this.state);

        addEventListener(this.rootRef.current, 'wheel', this.handleZoomWheel, {capture: true, passive: false});
        addEventListener(window, 'keydown', this.handleKeyDown, true);
        this.resizeWidthHandler = addFrameEventListener('resize', this.checkWidth, () => this.rootRef.current);
    }

    componentDidUpdate() {
        const {nodeMetrics, panZoom, onPanZoomChange} = this.props;
        if (!panZoom && onPanZoomChange) {
            onPanZoomChange({
                top: 0,
                left: 0,
                zoom: 100,
            });
        }
        this.selectCursor(this.props);
        this.selectCanvasRect(this.props, this.state);
        this.checkWidth();

        const count = (nodeMetrics?.lineNumbers - 1) || 0;
        if (
            (count > LINE_SOFT_MAXIMUM && count <= LINE_HARD_MAXIMUM && (this.lastCount <= LINE_SOFT_MAXIMUM || this.lastCount > LINE_HARD_MAXIMUM)) ||
            (count > LINE_HARD_MAXIMUM && this.lastCount <= LINE_HARD_MAXIMUM)
        ) {
            setTimeout(() => this.setState({showBanner: true}));
        }
        this.lastCount = count;
    }

    componentWillUnmount() {
        this._isMounted = false;
        clearTimeout(this.dragScrollTimeout);
        clearTimeout(this.canvasTimeout);
        clearTimeout(this.scrollTimeout);
        clearTimeout(this.updateTimeout);
        clearInterval(this.intervalWheel);
        removeEventListener(window, 'keydown', this.handleKeyDown, true);
        removeFrameEventListener('resize', this.resizeWidthHandler);
    }

    renderBanner() {
        const {showBanner} = this.state;
        if (!showBanner) {
            return null;
        }

        const {
            nodeMetrics,
            t,
        } = this.props;
        const count = (nodeMetrics?.lineNumbers - 1) || 0;
        if (count < LINE_SOFT_MAXIMUM) {
            return null;
        }

        if (count >= LINE_HARD_MAXIMUM) {
            return (
                <div className="taskbot-canvas-flow__banner taskbot-canvas-flow__banner--error">
                    <ActionBar className="taskbot-canvas-flow__banner-close">
                        <ActionBar.Action
                            name="banner-close"
                            aa="misc-clear"
                            label={t('taskbot:flow-maximum-banner-close')}
                            onClick={() => this.setState({showBanner: false})}
                        />
                    </ActionBar>
                    {t('taskbot:flow-maximum-banner--hard', {maximum: LINE_HARD_MAXIMUM})}
                </div>
            );
        }

        return (
            <div className="taskbot-canvas-flow__banner taskbot-canvas-flow__banner--warning">
                <ActionBar className="taskbot-canvas-flow__banner-close">
                    <ActionBar.Action
                        name="banner-close"
                        aa="misc-clear"
                        label={t('taskbot:flow-maximum-banner-close')}
                        onClick={() => this.setState({showBanner: false})}
                    />
                </ActionBar>
                {t('taskbot:flow-maximum-banner--soft', {current: count, maximum: LINE_HARD_MAXIMUM})}
            </div>
        );
    }

    render() {
        const {
            mode,
            loading,
            nodes, triggers,
            nodeMetrics,
            draggingType, draggingOver, onNodeDragEnd, onNodeDragOver,
            onPanZoomChange,
            onDragOver, onDrop,
            collapsed, onCollapsedChange,
            t,
        } = this.props;
        const count = (nodeMetrics?.lineNumbers - 1) || 0;
        if (count >= LINE_HARD_MAXIMUM) {
            return (
                <>
                    <div className={classnames('taskbot-canvas-flow', 'taskbot-canvas-flow--maximum')}>
                        <div className="taskbot-canvas-flow__maximum-help">
                            <div className="taskbot-canvas-flow__maximum-help-title">
                                {t('taskbot:flow-maximum-help-title')}
                            </div>
                            <div className="taskbot-canvas-flow__maximum-help-body">
                                {t('taskbot:flow-maximum-help-body')}
                            </div>
                            {onCollapsedChange ? (
                                <CommandButton
                                    name="canvas-list"
                                    onClick={() => {
                                        onCollapsedChange(collapsed.add(KEY_CANVAS_FLOW).remove(KEY_CANVAS_LIST).clone());
                                    }}
                                >
                                    {t('taskbot:flow-maximum-help-list-button')}
                                </CommandButton>
                            ) : null}
                        </div>
                    </div>
                    {this.renderBanner()}
                </>
            );
        }

        const {canvasRect, panning} = this.state;
        const strokeWidth = this.selectStrokeWidth(this.props, this.state);
        const flowStyle = this.selectFlowStyle(this.props, this.state);
        const panZoom = this.selectPanZoom(this.props, this.state);
        const layout = this.selectLayout(this.props);
        const draggingTo = this.selectDraggingTo(this.props);
        const {bounds, points} = layout;
        const size = panZoom.zoom < 60 ? LAYOUT_SIZE_SMALL : LAYOUT_SIZE_LARGE;
        return (
            <>
                <div
                    className={classnames('taskbot-canvas-flow', {
                        'taskbot-canvas-flow--editable': mode === 'edit',
                        'taskbot-canvas-flow--panning': panning,
                    })}
                    ref={this.rootRef}
                >
                    <div
                        className="taskbot-canvas-flow__layout"
                        ref={this.layoutRef}
                        // Only allow dropping from this source
                        data-dragging={draggingType ? '' : null}
                    >
                        <div
                            className="taskbot-canvas-flow__background"
                            ref={this.backgroundRef}
                            onMouseDown={this.handlePanStartMouse}
                            onTouchStart={this.handlePanStartTouch}
                            onDragEnter={onDragOver && onDrop ? this.handleDragBackground : null}
                            onDragOver={onDragOver && onDrop ? this.handleDragBackground : null}
                            onDrop={onDrop}
                        />
                        <svg
                            className="taskbot-canvas-flow__svg"
                            height={flowStyle.height}
                            width={flowStyle.width}
                            style={flowStyle}
                        >
                            <TaskbotCanvasFlowBackground
                                loading={Boolean(loading)}
                                triggers={triggers}

                                size={size}
                                layout={layout}
                                strokeWidth={strokeWidth}

                                draggingTo={draggingTo}
                                draggingType={draggingType}
                                draggingOver={draggingOver}
                            />
                        </svg>
                        <div
                            className="taskbot-canvas-flow__points"
                            ref={this.pointsRef}
                            style={flowStyle}
                            onMouseDown={this.handlePanStartMouse}
                            onTouchStart={this.handlePanStartTouch}
                            onDragEnter={onDragOver && onDrop ? this.handleDragBackground : null}
                            onDragOver={onDragOver && onDrop ? this.handleDragBackground : null}
                            onDrop={onDrop}
                        >
                            {points.map((point) => {
                                let hidden = loading || !canvasRect.height || !canvasRect.width;
                                if (!hidden && (point.type !== LAYOUT_POINT_TRIGGERS && point.type !== LAYOUT_POINT_START && point.type !== LAYOUT_POINT_END)) {
                                    if (process.env.NODE_ENV !== 'test') {
                                        const pointRect = {
                                            top: point.y - canvasRect.padding,
                                            bottom: point.y + point.height + canvasRect.padding,
                                            left: point.x - canvasRect.padding,
                                            right: point.x + point.width + canvasRect.padding,
                                        };
                                        if (onNodeDragOver) {
                                            switch (point.type) {
                                                case LAYOUT_POINT_CONTAINER:
                                                    if (point.shape) {
                                                        let canBranchAfter = false;
                                                        if (point.node && point.command) {
                                                            const isBranchable = point.command.branchable;
                                                            const isBranch = point.command.branchOf;
                                                            const isBranchEnd = point.command.branchEnd;
                                                            if (isBranchable && point.node.branches?.length === 0) {
                                                                canBranchAfter = true;
                                                            }
                                                            if (isBranch && !isBranchEnd && point.parent?.branches) {
                                                                const lastBranch = point.parent.branches[point.parent.branches.length - 1];
                                                                if (lastBranch && lastBranch.uid === point.node.uid) {
                                                                    canBranchAfter = true;
                                                                }
                                                            }
                                                        }
                                                        pointRect.top = point.shape.y - canvasRect.padding - 92;
                                                        pointRect.bottom = point.shape.y + point.shape.height + canvasRect.padding;
                                                        pointRect.left = point.shape.x - canvasRect.padding;
                                                        pointRect.right = point.shape.x + point.shape.width + canvasRect.padding + (canBranchAfter ? 92 : 0);
                                                    }
                                                    else {
                                                        pointRect.top -= 92;
                                                    }
                                                    break;
                                                case LAYOUT_POINT_TRIGGER:
                                                    pointRect.right += 100;
                                                    break;
                                                case LAYOUT_POINT_NODE:
                                                    pointRect.top -= 92;
                                                    break;
                                            }
                                        }
                                        hidden = (
                                            pointRect.bottom < canvasRect.top ||
                                            pointRect.top > canvasRect.bottom ||
                                            pointRect.right < canvasRect.left ||
                                            pointRect.left > canvasRect.right
                                        );
                                    }
                                }
                                if (hidden) {
                                    return null;
                                }

                                return (
                                    <TaskbotCanvasFlowPoint
                                        {...this.props}

                                        key={point.key}

                                        strokeWidth={strokeWidth}
                                        size={size}
                                        point={point}
                                        bounds={bounds}

                                        isEmpty={!nodes || nodes.length === 0}

                                        nodeMetrics={nodeMetrics}
                                        draggingTo={draggingTo}
                                        panZoom={null}
                                    />
                                );
                            })}
                        </div>
                        <ActionBar className="taskbot-canvas-flow__controls" theme="info">
                            <ActionBar.Action
                                label={t('taskbot:graph-zoom-fit')}
                                iconName="square-four-corners"
                                onClick={this.handleZoomFit}
                            />
                            <ActionBar.Action
                                label={t('taskbot:graph-zoom-out')}
                                iconName="magnifying-glass--minus"
                                onClick={panZoom.zoom <= ZOOM_MINIMUM ? null : this.handleZoomOut}
                            />
                            <ActionBar.Action
                                label={t('taskbot:graph-zoom-in')}
                                iconName="magnifying-glass--plus"
                                onClick={panZoom.zoom >= ZOOM_MAXIMUM ? null : this.handleZoomIn}
                            />
                        </ActionBar>
                        {onDragOver && onPanZoomChange ? (
                            <>
                                <div
                                    className="taskbot-canvas-flow__scroller-dropzone taskbot-canvas-flow__scroller-dropzone--n"
                                    onDragEnter={(event) => this.handleDragScroll(event, 0, 1)}
                                    onDragOver={(event) => this.handleDragScroll(event, 0, 1)}
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
                                    className="taskbot-canvas-flow__scroller-dropzone taskbot-canvas-flow__scroller-dropzone--s"
                                    onDragEnter={(event) => this.handleDragScroll(event, 0, -1)}
                                    onDragOver={(event) => this.handleDragScroll(event, 0, -1)}
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
                                    className="taskbot-canvas-flow__scroller-dropzone taskbot-canvas-flow__scroller-dropzone--e"
                                    onDragEnter={(event) => this.handleDragScroll(event, -1, 0)}
                                    onDragOver={(event) => this.handleDragScroll(event, -1, 0)}
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
                                    className="taskbot-canvas-flow__scroller-dropzone taskbot-canvas-flow__scroller-dropzone--w"
                                    onDragEnter={(event) => this.handleDragScroll(event, 1, 0)}
                                    onDragOver={(event) => this.handleDragScroll(event, 1, 0)}
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
                                    className="taskbot-canvas-flow__scroller-dropzone taskbot-canvas-flow__scroller-dropzone--ne"
                                    onDragEnter={(event) => this.handleDragScroll(event, -1, 1)}
                                    onDragOver={(event) => this.handleDragScroll(event, -1, 1)}
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
                                    className="taskbot-canvas-flow__scroller-dropzone taskbot-canvas-flow__scroller-dropzone--nw"
                                    onDragEnter={(event) => this.handleDragScroll(event, 1, 1)}
                                    onDragOver={(event) => this.handleDragScroll(event, 1, 1)}
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
                                    className="taskbot-canvas-flow__scroller-dropzone taskbot-canvas-flow__scroller-dropzone--se"
                                    onDragEnter={(event) => this.handleDragScroll(event, -1, -1)}
                                    onDragOver={(event) => this.handleDragScroll(event, -1, -1)}
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
                                    className="taskbot-canvas-flow__scroller-dropzone taskbot-canvas-flow__scroller-dropzone--sw"
                                    onDragEnter={(event) => this.handleDragScroll(event, 1, -1)}
                                    onDragOver={(event) => this.handleDragScroll(event, 1, -1)}
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
                </div>
                {this.renderBanner()}
            </>
        );
    }
}

export {TaskbotCanvasFlow};
