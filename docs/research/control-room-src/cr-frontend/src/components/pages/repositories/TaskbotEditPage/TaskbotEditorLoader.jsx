/**
 * Copyright (c) 2020 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import React, {useMemo, useState} from 'react';
import {useSelector} from 'react-redux';
import {EMPTY_ARRAY, useApi} from '@automationanywhere/rio-components';
import {getVariableKey} from '@automationanywhere/rio-components/editor';

import {ErrorBoundary} from '../../../common/ErrorBoundary';
import {TaskbotEditor} from '../../../editor/TaskbotEditor';
import {getFile, getFileContent, getFileInterface} from '../../../../store/api/repositories';
import {getDefaultPackageDetails, getPackageDetails} from '../../../../store/selectors/packageDetails';
import {selectFeatureCloudTriggers, selectFeatureProcessWebTriggers} from '../../../../store/selectors/access';
import {getPackageVersions} from '../../../../store/api/packageVersions';
import {mergeMetaPackage} from '../../../../store/sagas/packages';
import {selectT} from '../../../../store/selectors/i18n';
import {getAutomationTypeHasDebug} from '../../../../store/selectors/taskbotFeatures';
import {createGetNodeReport, createTaskbotReport} from '../../../../store/selectors/taskbotReports';
import {FILE_TAG_TYPE_INTENDED_PLATFORM} from '../../../../store/constants/repositories';
import {getTagValue} from '../../../../util/tags';

import {getTaskAliases} from './processAliases';

const getUriPath = (uri) => uri ? decodeURI(uri.replace(/^repository:\/\//, '').replace(/\?.*$/, '')) : null;
const getArray = (object) => (object && Array.isArray(object) && object.length > 0) ? object.filter(Boolean) : [];

const TaskbotEditorLoader = (props) => {
    const {
        file,
        loading,
        featureFlags,
        licenseFeatures,
        debugger: debuggerProp,
        packageDetails: packageDetailsProp,
        automationReport, globalValues, taskAliases, fileInterfaceMap,
    } = props;

    const [overrideProps, setOverrideProps] = useState(null);
    const overridePropsCache = useMemo(() => new Map(), []);
    const defaultOverrideProps = useMemo(() => {
        return {
            file: null,
            automationType: null,
            automationIntendedPlatform: null,
            triggers: [],
            nodes: [],
            orphans: [],
            swimlanes: [],
            swimlaneStacking: 'LEFT_TO_RIGHT',
            onNodesChange: null,
            variables: [],
            onVariablesChange: null,
            hasProcessCodeVersion0: false,
            getUnusedVariables: () => [],
            breakpoints: [],
            onBreakpointsChange: null,
            onSearchParametersChange: null,
            ...getDefaultPackageDetails(),
        };
    }, []);

    const t = useSelector(selectT);
    const hasFeatureCloudTriggers = useSelector(selectFeatureCloudTriggers);
    const hasFeatureProcessWebTriggers = useSelector(selectFeatureProcessWebTriggers);

    const fileUriPath = getUriPath(file?.uri);
    const currentFrameFileUri = debuggerProp?.callstackFrames?.find((frame) => debuggerProp.currentCallstackFrameUuid && frame.frameUuid === debuggerProp.currentCallstackFrameUuid)?.fileUri;

    const [pending] = useApi(
        async(signal) => {
            if (currentFrameFileUri && fileUriPath !== getUriPath(currentFrameFileUri)) {
                let cachedOverrideProps = overridePropsCache.get(currentFrameFileUri);
                if (cachedOverrideProps) {
                    setOverrideProps({
                        ...defaultOverrideProps,
                        ...cachedOverrideProps,
                    });
                    return;
                }

                setOverrideProps(defaultOverrideProps);
                const currentFrameFileParams = currentFrameFileUri.replace(/.*\?/, '').split('&').reduce((result, query) => {
                    const [name, value] = query.split('=', 2);
                    if (value) {
                        result[name] = value;
                    }
                    return result;
                }, {});

                let file = null;
                let content = {};
                if (currentFrameFileParams.workspace === 'PRIVATE') {
                    file = await getFile(signal, currentFrameFileParams.fileId);
                    if (file.permission?.viewContent) {
                        content = await getFileContent(signal, currentFrameFileParams.fileId, file.type);
                    }
                    else {
                        content = await getFileInterface(signal, currentFrameFileParams.fileId, file.type);
                    }
                }
                else {
                    file = await getFile(signal, currentFrameFileParams.fileId, currentFrameFileParams.label, currentFrameFileParams.version);
                    if (file.permission?.viewContent) {
                        content = await getFileContent(signal, currentFrameFileParams.fileId, file.type, currentFrameFileParams.label, currentFrameFileParams.version);
                    }
                    else {
                        content = await getFileInterface(signal, currentFrameFileParams.fileId, file.type, currentFrameFileParams.label, currentFrameFileParams.version);
                    }
                }
                const packages = content.packages?.length > 0
                    ? await getPackageVersions(signal, content.packages.map(({name, version}) => ({name, version})))
                    : [];
                const packageVersions = packages.map(mergeMetaPackage);
                const packageDetails = getPackageDetails(packageVersions, file, hasFeatureCloudTriggers, hasFeatureProcessWebTriggers);

                cachedOverrideProps = {
                    file,
                    fildId: file.id,
                    automationType: file.type,
                    automationIntendedPlatform: getTagValue(file?.tags, FILE_TAG_TYPE_INTENDED_PLATFORM),
                    triggers: content.triggers ?? [],
                    nodes: content.nodes ?? [],
                    orphans: content.orphans ?? [],
                    swimlanes: content.swimlanes ?? [],
                    swimlaneStacking: content.swimlaneStacking ?? 'LEFT_TO_RIGHT',
                    variables: getArray(content.variables).map((variable) => ({
                        ...variable,
                        key: getVariableKey(variable.name),
                    })),
                    packageDetails,
                    hasProcessCodeVersion0: (content.properties?.processCodeVersion ?? '0') === '0',
                    ...packageDetails,
                };
                overridePropsCache.set(currentFrameFileUri, cachedOverrideProps);
                setOverrideProps({
                    ...defaultOverrideProps,
                    ...cachedOverrideProps,
                });
                return;
            }

            setOverrideProps(null);
        },
        () => null,
        [fileUriPath, currentFrameFileUri, hasFeatureCloudTriggers],
    );

    const debuggerApiVersion = debuggerProp?.botAgentDebugApiVersion ?? 1;
    const breakpointsProps = useMemo(() => {
        if (overrideProps && debuggerApiVersion <= 3) {
            return {
                breakpoints: EMPTY_ARRAY,
                onBreakpointsChange: null,
            };
        }
        const currentFile = (debuggerApiVersion >= 4 ? overrideProps?.file : undefined) ?? file;
        const debugPoints = props.debugPointsMap.get(currentFile?.path);
        return {
            breakpoints: debugPoints?.breakpoints ?? EMPTY_ARRAY,
            onBreakpointsChange: getAutomationTypeHasDebug(currentFile?.type) && props.canDebug ? (breakpoints) => props.onDebugPointsMapChange(currentFile?.path, currentFile?.id, {breakpoints}) : null,
        };
    }, [file, overrideProps, debuggerApiVersion, props.canDebug, props.onBreakpointsChange, props.debugPointsMap]);

    const nextAutomationReport = useMemo(() => {
        let nextAutomationReport = automationReport;
        if (overrideProps) {
            const {file, automationType, variables, triggers, nodes, orphans, swimlanes, packageDetails} = overrideProps;
            const taskAliases = getTaskAliases(automationType, nodes, packageDetails, t);
            const fileType = file?.type;
            const fileIntendedPlatform = getTagValue(file?.tags, FILE_TAG_TYPE_INTENDED_PLATFORM);

            const getNodeReport = createGetNodeReport(
                featureFlags,
                licenseFeatures,
                overrideProps,
                globalValues,
                taskAliases,
                variables,
                fileType,
                fileIntendedPlatform,
                fileInterfaceMap,
                null,
                t,
            );
            nextAutomationReport = createTaskbotReport(automationType, overrideProps, triggers, nodes, orphans, swimlanes, getNodeReport);
        }
        return nextAutomationReport;
    }, [featureFlags, licenseFeatures, automationReport, overrideProps, globalValues, taskAliases, fileInterfaceMap, t]);

    return (
        <ErrorBoundary>
            <TaskbotEditor
                {...props}
                {...(
                    overrideProps ||
                    (packageDetailsProp ? {packageDetails: packageDetailsProp, ...packageDetailsProp} : null) ||
                    {}
                )}
                {...breakpointsProps}
                automationReport={nextAutomationReport}
                loading={Boolean(loading || pending)}
                childLoading={pending}
            />
        </ErrorBoundary>
    );
};

TaskbotEditorLoader.displayName = 'TaskbotEditorLoader';

export {TaskbotEditorLoader};
