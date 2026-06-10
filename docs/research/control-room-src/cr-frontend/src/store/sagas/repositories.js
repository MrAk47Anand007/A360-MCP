/**
 * Copyright (c) 2020 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import {takeEvery, all, put, call, select} from 'redux-saga/effects';
import {combinePaginationFilters} from '@automationanywhere/rio-components';
import isEqual from 'lodash/isEqual';

import {
    getFilePathDependencyIds,
    getProcessDependencyPaths,
    getProcessV1Content,
    getProcessV2Content,
} from '../../components/pages/repositories/TaskbotEditPage/processContent';
import {routerPush} from '../actions/router';
import * as actions from '../actions/repositories';
import {create as toastCreate} from '../actions/toasts';
import {
    getFileType,
    WORKSPACE_PRIVATE,
    WORKSPACE_PUBLIC,
    STATUS_NEW,
    STATUS_NONE,
    NOT_APPLICABLE,
    FILE_TYPE_FORM,
    FILE_TYPE_TASKBOT,
    FILE_TYPE_PROCESS,
    FILE_TYPE_AI_SKILL,
    FILE_TYPE_HEADLESSBOT,
} from '../constants/repositories';
import * as API from '../api/repositories';
import {getFolderPolicySettings} from '../api/codeAnalysis';
import {apiSaga} from '../../util/reducer';
import {selectT} from '../selectors/i18n';
import {selectCodeAnalysisEnabled} from '../selectors/repositories';
import {selectFeatureAccessPolicies, selectFeatureHeadlessBots} from '../selectors/access';
import {getAutomationTypeHasCodeAnalysis, getAutomationTypeIsProcess} from '../selectors/taskbotFeatures';

import {sessionErrorHandling, updateSessionUserPermissions} from './session';
import {encryptData} from './application';

// FOLDERS -------------------------------------------------------------------
function *folderList(action) {
    const {workspaceName} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FOLDER_LIST,
        id: `get-folders-${workspaceName}`,
        force: true,
        *onPending(signal) {
            const {list} = yield call(API.getFolders, signal, workspaceName);
            return {workspaceName, folders: list};
        },
        onError: sessionErrorHandling,
    });
}

function *folderChildren(action) {
    const {workspaceName, folderId} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FOLDER_CHILDREN,
        id: `get-folders-${workspaceName}-${folderId}-children`,
        force: true,
        *onPending(signal) {
            const {list} = yield call(API.getFolderChildren, signal, folderId);
            return {workspaceName, children: list};
        },
        onError: sessionErrorHandling,
    });
}

function *folderAncestors(action) {
    const {workspaceName, folderId} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FOLDER_ANCESTORS,
        id: `get-folders-${workspaceName}-${folderId}-ancestors`,
        force: true,
        *onPending(signal) {
            let {list} = yield call(API.getFolderAncestors, signal, folderId);

            // HACK: sort correctly with Bots before Bot Store
            list.sort((a, b) => {
                if (a.path.startsWith('Automation Anywhere\\Bots') && b.path.startsWith('Automation Anywhere\\Bot Store')) {
                    return -1;
                }

                if (b.path.startsWith('Automation Anywhere\\Bots') && a.path.startsWith('Automation Anywhere\\Bot Store')) {
                    return 1;
                }

                return a.path.localeCompare(b.path);
            });

            // HACK: remove duplicates that have "folderCount" = "0"
            list = list.reduce((list, folder) => {
                const lastFolder = list[list.length - 1];
                if (lastFolder && lastFolder.id === folder.id) {
                    if (lastFolder.folder !== '0') {
                        list[list.length - 1] = folder;
                    }
                }
                else {
                    list.push(folder);
                }
                return list;
            }, []);

            return {workspaceName, ancestors: list};
        },
        onError: sessionErrorHandling,
    });
}

function *getFolder(action) {
    const {force, id} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FOLDER_GET,
        id: `get-folder-${id}`,
        objectId: id,
        force,
        *onPending(signal) {
            const folder = yield call(API.getFolder, signal, id);
            return {folder};
        },
        onError: sessionErrorHandling,
    });
}
function *destroyFolder(action) {
    const {force, workspaceName, folder} = action.payload;
    const {id, name, parentId} = folder;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FOLDER_DESTROY,
        id: `destroy-folder-${id}`,
        force,
        *onPending(signal) {
            yield call(API.destroyFolder, signal, id);
        },
        *onDone() {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: name,
                message: t('toast-message-deleted'),
            }));
            yield put(routerPush(`/bots/repository/${workspaceName}/folders/${parentId}`));
        },
        onError: sessionErrorHandling,
    });
}

// FILES --------------------------------------------------------------------
function *uploadFiles(action) {
    const {force, workspaceName, folderId, files, callback} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_UPLOAD,
        id: 'uploadFile',
        force,
        *onPending(signal) {
            return yield all(files.map((file) => call(API.uploadFile, signal, folderId, file, getFileType(file))));
        },
        *onDone(result) {
            if (files.length) {
                const t = yield select(selectT);
                const title = files.length === 1
                    ? files[0].name
                    : t('repository:file-count', {count: files.length});
                yield put(toastCreate({
                    title,
                    message: t('toast-message-uploaded'),
                }));
            }
            if (callback) {
                callback(result);
            }
            else {
                yield put(routerPush(`/bots/repository/${workspaceName}/folders/${folderId}`));
            }
            yield call(updateSessionUserPermissions);
        },
        onError: sessionErrorHandling,
    });
}

function *createFile(action) {
    const {force, workspaceName, file: actionFile, content, dependencies, hasErrors, onComplete, onError} = action.payload;
    const {name: fileName, parentFolderId} = actionFile;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_CREATE,
        id: 'create-file',
        force,
        *onPending(signal) {
            const file = yield call(API.createFile, signal, actionFile);
            if (content) {
                yield call(API.updateFileContent, signal, file.id, file.type, content, hasErrors);
            }
            if (dependencies) {
                yield call(API.updateFileDependencies, signal, file.id, dependencies);
            }
            return {file};
        },
        *onDone({file}) {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: fileName,
                message: t('toast-message-created'),
            }));
            if (onComplete) {
                onComplete(workspaceName, file.id, file);
            }
            else {
                yield put(routerPush(`/bots/repository/${workspaceName}/folders/${parentFolderId}`));
            }
            yield call(updateSessionUserPermissions);
        },
        *onError(error) {
            yield sessionErrorHandling(error);
            if (onError) {
                onError();
            }
        },
    });
}

function *updateFile(action) {
    const {force, workspaceName, file, hasErrors, onComplete, onError} = action.payload;
    let {content, dependencies} = action.payload;
    let updatedFile = file;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_UPDATE,
        id: `update-file-${file.id}`,
        force,
        *onPending(signal) {
            const {file: lastFile} = yield select((state) => state.repositories);
            if (file && !isEqual(file, lastFile)) {
                yield call(API.updateFile, signal, file);
            }
            if (content) {
                if (getAutomationTypeIsProcess(file.type)) {
                    const v2Content = content;
                    // Transform v2 to v1 content
                    if ((v2Content.properties?.processCodeVersion || '0') === '0') {
                        content = yield call(getProcessV1Content, v2Content);
                    }
                    const dependencyPaths = getProcessDependencyPaths(v2Content);
                    if (dependencyPaths.size > 0) {
                        dependencies = yield call(getFilePathDependencyIds, signal, dependencyPaths);
                    }
                }
                yield call(API.updateFileContent, signal, file.id, file.type, content, hasErrors);
            }
            if (dependencies) {
                yield call(API.updateFileDependencies, signal, file.id, dependencies);
            }
            updatedFile = yield call(API.getFile, signal, file.id);
            let policy = null;
            let codeAnalysisReport = null;
            let codeAnalysisSettings = null;
            if (updatedFile.codeAnalysisResult !== NOT_APPLICABLE) {
                const hasFeaturePolicies = yield select(selectFeatureAccessPolicies);
                const codeAnalysisEnabled = yield select(selectCodeAnalysisEnabled);
                const hasAPITaskFeature = yield select(selectFeatureHeadlessBots);
                if (hasFeaturePolicies && codeAnalysisEnabled && ((file.type === FILE_TYPE_HEADLESSBOT && hasAPITaskFeature) || file.type === FILE_TYPE_TASKBOT)) {
                    try {
                        policy = yield call(API.getBotPolicy, signal, updatedFile.id);
                        if (policy) {
                            codeAnalysisReport = yield call(API.getBotCodeAnalysisReport, signal, updatedFile.id);
                            codeAnalysisSettings = yield call(getFolderPolicySettings, signal, updatedFile.path, updatedFile.type);
                        }
                    }
                    catch (error) {
                        policy = null;
                        codeAnalysisReport = null;
                        codeAnalysisSettings = null;
                    }
                }
            }
            return {file: updatedFile, policy, codeAnalysisReport, codeAnalysisSettings};
        },
        *onDone() {
            if (onComplete) {
                onComplete(workspaceName, updatedFile.id, updatedFile);
            }
            else {
                yield put(routerPush(`/bots/repository/${workspaceName}/folders/${updatedFile.parentId}`));
            }
        },
        *onError(error) {
            yield sessionErrorHandling(error);
            if (onError) {
                onError(error);
            }
        },
    });
}

function *getFile(action) {
    const {force, id, versionNumber = null, content: hasContent, dependencies: hasDependencies} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_GET,
        id: `get-file-${id}`,
        objectId: id,
        force,
        *onPending(signal) {
            yield put({type: actions.REPOS_FILE_INTERFACES_RESET});
            const file = yield call(API.getFile, signal, id, null, versionNumber);
            let content = null;
            if (hasContent) {
                content = yield call(API.getFileContent, signal, file.id, file.type, null, versionNumber);
                if (getAutomationTypeIsProcess(file.type)) {
                    // Transform v1 to v2 content
                    if ((content.properties?.processCodeVersion || '0') === '0') {
                        content = yield call(getProcessV2Content, file.workspaceType === 'PRIVATE' ? WORKSPACE_PRIVATE : WORKSPACE_PUBLIC, file, content);
                    }
                }
            }
            let dependencies = null;
            if (hasDependencies) {
                const {dependencies: list} = yield call(API.getFileDependencies, signal, file.id, null, versionNumber);
                if (list) {
                    dependencies = list.filter((dependency) => dependency.id !== file.id);
                }
            }
            let codeAnalysisReport = null;
            let codeAnalysisSettings = null;
            let policy = null;
            if (hasContent) {
                if (file.codeAnalysisResult !== NOT_APPLICABLE) {
                    const hasFeaturePolicies = yield select(selectFeatureAccessPolicies);
                    const codeAnalysisEnabled = yield select(selectCodeAnalysisEnabled);
                    const hasFeatureHeadlessBots = yield select(selectFeatureHeadlessBots);
                    if (hasFeaturePolicies && codeAnalysisEnabled && getAutomationTypeHasCodeAnalysis(file.type, hasFeatureHeadlessBots)) {
                        try {
                            policy = yield call(API.getBotPolicy, signal, file.id);
                            if (policy) {
                                codeAnalysisReport = yield call(API.getBotCodeAnalysisReport, signal, file.id, null, versionNumber);
                                codeAnalysisSettings = yield call(getFolderPolicySettings, signal, file.path, file.type);
                            }
                        }
                        catch (error) {
                            policy = null;
                            codeAnalysisReport = null;
                            codeAnalysisSettings = null;
                        }
                    }
                }
            }

            return {file, content, dependencies, codeAnalysisReport, codeAnalysisSettings, policy};
        },
        onError: sessionErrorHandling,
    });
}

function *destroyFile(action) {
    const {force, workspaceName, file} = action.payload;
    const {id, name, parentId} = file;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_DESTROY,
        id: `destroy-file-${id}`,
        force,
        *onPending(signal) {
            yield call(API.destroyFile, signal, id);
        },
        *onDone() {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: name,
                message: t('toast-message-deleted'),
            }));
            yield put(routerPush(`/bots/repository/${workspaceName}/folders/${parentId}`));
        },
        onError: sessionErrorHandling,
    });
}
function *destroyBatchFile(action) {
    const {force, workspaceName, files} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_DESTROY_BATCH,
        id: 'destroy-batch-file',
        force,
        *onPending(signal) {
            yield call(API.destroyBatchFile, signal, files.map(({id}) => id));
        },
        *onDone() {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: t('resource-count', {count: files.length, resource: 'items'}),
                message: t('toast-message-deleted'),
            }));
            if (files.length > 0) {
                const {parentId} = files[0];
                if (files.every((file) => file.parentId === parentId)) {
                    yield put(routerPush(`/bots/repository/${workspaceName}/folders/${parentId}`));
                    return;
                }
            }

            yield put(routerPush(`/bots/repository/${workspaceName}/folders`));
        },
        onError: sessionErrorHandling,
    });
}

// DEPENDENCIES --------------------------------------------------------------------
function *getFileDependencies(action) {
    const {force, id, parentId, fullGraph} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_DEPENDENCIES_GET,
        id: parentId ? `get-file-dependencies-${id}-${parentId}` : `get-file-dependencies-${id}`,
        objectId: id,
        force,
        *onPending(signal) {
            const {dependencies} = fullGraph
                ? yield call(API.getFileDependenciesFullGraph, signal, id)
                : yield call(API.getFileDependencies, signal, id);
            return {fileId: id, dependencies};
        },
        onError: sessionErrorHandling,
    });
}

// AUTOMATION VARIABLES --------------------------------------------------------------------
function *getFileInterface(action) {
    const {force, workspaceName, path, label, version, callback} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_INTERFACE_GET,
        id: `get-file-interface--${path}`,
        objectId: path,
        force,
        *onPending(signal) {
            const file = yield call(API.getFileByPath, signal, workspaceName, path);
            let fileInterface = null;
            switch (file?.type) {
                case FILE_TYPE_TASKBOT: // TODO: use Automation Interface
                case FILE_TYPE_HEADLESSBOT: // TODO: use Automation Interface
                case FILE_TYPE_PROCESS: // TODO: use Automation Interface
                case FILE_TYPE_FORM:
                    fileInterface = yield call(API.getFileInterface, signal, file.id, file.type, label, version);
                    break;
                case FILE_TYPE_AI_SKILL:
                    fileInterface = yield call(API.getFilePromptInterface, signal, file.id, label, version);
                    break;
            }
            return {[path]: fileInterface};
        },
        onDone(result) {
            if (callback) {
                callback(result[path]);
            }
        },
        onError: sessionErrorHandling,
    });
}

function *tryCheckOutFile(action) {
    const {force, file} = action.payload;
    const {id, name} = file;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_TRY_CHECKOUT,
        id: `tryCheckout-${id}`,
        force,
        *onPending(signal) {
            const {dependencies} = yield call(API.getFileDependencies, signal, id);
            if (dependencies && dependencies.length > 1) {
                return {fileId: id, dependencies};
            }

            yield call(API.checkOutFiles, signal, [id]);
            const nearestFolder = yield call(API.getNearestFolder, signal, WORKSPACE_PRIVATE, file.path);
            if (nearestFolder) {
                return {nearestFolder};
            }
        },
        *onDone({dependencies, nearestFolder}) {
            if (dependencies) {
                yield put(routerPush(`/bots/repository/public/files/${id}/checkout`));
                return;
            }

            const t = yield select(selectT);
            yield put(toastCreate({
                title: t('toast-title-checkout', {file: name}),
                message: t('toast-message-started'),
            }));
            if (nearestFolder) {
                yield put(routerPush(`/bots/repository/private/folders/${nearestFolder.id}`));
            }
            else {
                yield put(routerPush('/bots/repository/private'));
            }
            yield call(updateSessionUserPermissions);
        },
        onError: sessionErrorHandling,
    });
}

function *checkOutFiles(action) {
    const {force, file, fileDependencies} = action.payload;
    const {id, name} = file;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_CHECKOUT,
        id: `checkout-${id}`,
        force,
        *onPending(signal) {
            const fileIds = fileDependencies ? [id, ...fileDependencies] : [id];
            yield call(API.checkOutFiles, signal, fileIds);
        },
        *onDone() {
            const t = yield select(selectT);
            if (fileDependencies && fileDependencies.length > 0) {
                yield put(toastCreate({
                    title: t('toast-title-checkout-with-dependencies', {file: name, count: fileDependencies.length}),
                    message: t('toast-message-started'),
                }));
            }
            else {
                yield put(toastCreate({
                    title: t('toast-title-checkout', {file: name}),
                    message: t('toast-message-started'),
                }));
            }
            yield put(routerPush('/bots/repository/private'));
            yield call(updateSessionUserPermissions);
        },
        onError: sessionErrorHandling,
    });
}

function *cancelCheckOutFile(action) {
    const {force, file} = action.payload;
    const {id, name} = file;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_CANCEL_CHECKOUT,
        id: `cancel-checkout-${id}`,
        force,
        *onPending(signal) {
            yield call(API.cancelCheckOutFile, signal, id);
        },
        *onDone() {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: t('toast-title-cancel-checkout', {file: name}),
                message: t('toast-message-started'),
            }));
            yield call(updateSessionUserPermissions);
        },
        onError: sessionErrorHandling,
    });
}

function *checkCloneFile(action) {
    const {force, file, callback} = action.payload;
    const {id} = file;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_CHECK_CLONE,
        id: `checkCloneFile-${id}`,
        force,
        *onPending(signal) {
            const result = yield call(API.checkCloneFile, signal, id, false);
            return result;
        },
        *onDone(result) {
            const {hasDependencies} = result;
            const hasPrivateFile = result.existingFilesInPrivateWorkspace && result.existingFilesInPrivateWorkspace.some(({path, botStatus}) => path === file.path && botStatus === STATUS_NEW);
            callback(hasDependencies, hasPrivateFile);
        },
        onError: sessionErrorHandling,
    });
}

function *getCloneFileDependencies(action) {
    const {force, fileId: id} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_CLONE_DEPENDENCIES_GET,
        id: `cloneFileDependencies-${id}`,
        force,
        *onPending(signal) {
            const [
                file,
                {existingFilesInPrivateWorkspace},
                {dependencies},
            ] = yield all([
                call(API.getFile, signal, id),
                call(API.checkCloneFile, signal, id, true),
                call(API.getFileDependencies, signal, id),
            ]);
            const statuses = existingFilesInPrivateWorkspace.reduce((statuses, {path, botStatus}) => {
                statuses[path] = botStatus;
                return statuses;
            }, Object.create(null));
            const dependenciesWithStatus = dependencies.map((file) => ({
                ...file,
                privateStatus: statuses[file.path] || STATUS_NONE,
            }));
            return {file, dependencies: dependenciesWithStatus};
        },
        onError: sessionErrorHandling,
    });
}

function *cloneFile(action) {
    const {force, file, hasDependencies} = action.payload;
    const {id, name} = file;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_CLONE,
        id: `cloneFile-${id}`,
        force,
        *onPending(signal) {
            yield call(API.cloneFile, signal, id);
            const nearestFolder = yield call(API.getNearestFolder, signal, WORKSPACE_PRIVATE, file.path);
            return {nearestFolder};
        },
        *onDone({nearestFolder}) {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: hasDependencies
                    ? t('toast-title-clone-with-dependencies', {file: name})
                    : t('toast-title-clone', {file: name}),
                message: t('toast-message-started'),
            }));
            if (nearestFolder) {
                yield put(routerPush(`/bots/repository/private/folders/${nearestFolder.id}`));
            }
            else {
                yield put(routerPush('/bots/repository/private'));
            }
            yield call(updateSessionUserPermissions);
        },
        onError: sessionErrorHandling,
    });
}

function *checkInFiles(action) {
    const {force, file, fileDependencies, comment = ''} = action.payload;
    const {id, name} = file;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_CHECKIN,
        id: `checkin-${id}`,
        force,
        *onPending(signal) {
            const fileIds = fileDependencies ? [id, ...fileDependencies] : [id];
            yield call(API.checkInFiles, signal, fileIds, comment);
        },
        *onDone() {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: fileDependencies && fileDependencies.length > 0
                    ? t('toast-title-checkin-with-dependencies', {file: name, count: fileDependencies.length})
                    : t('toast-title-checkin', {file: name}),
                message: t('toast-message-started'),
            }));
            yield put(routerPush('/bots/repository/public'));
            yield call(updateSessionUserPermissions);
        },
        onError: sessionErrorHandling,
    });
}

function *getFilesDependencies(action) {
    const {force, fileIds, callback} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILES_DEPENDENCIES_GET,
        id: 'get-files-dependencies',
        force,
        *onPending(signal) {
            const {files} = yield call(API.getFilesDependencies, signal, fileIds);
            return {files};
        },
        *onDone({files}) {
            if (callback) {
                callback(files);
            }
        },
        onError: sessionErrorHandling,
    });
}

function *getFilesAndDependencies(action) {
    const {force, workspaceName, fileIds, label, callback} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILES_DEPENDENCIES_GET,
        id: 'get-files-dependencies',
        force,
        *onPending(signal) {
            const {list: files} = yield call(API.getAllFilesList, signal, workspaceName, {
                fields: [],
                filter: combinePaginationFilters('or', fileIds.map((id) => ({operator: 'eq', field: 'id', value: id}))),
                page: {offset: 0, length: 99999},
                sort: [{field: 'name', direction: 'asc'}],
            });
            const {dependencies} = yield call(API.getFilesDependencies, signal, fileIds, label);
            return {files, dependencies};
        },
        *onDone({files, dependencies}) {
            if (callback) {
                const fileIdsSet = new Set(fileIds);
                const {fileDependencies, missingFileDependencies} = dependencies.reduce((result, dependency) => {
                    if (dependency.id === '0') {
                        result['missingFileDependencies'].push(dependency.path);
                    }
                    else {
                        const {id, versionNumber} = dependency;
                        if (!fileIdsSet.has(id)) {
                            result['fileDependencies'].push({id, version: versionNumber});
                        }
                    }
                    return result;
                }, {
                    fileDependencies: [],
                    missingFileDependencies: [],
                });
                callback(
                    files.map(({id, versionNumber: version}) => ({id, version})),
                    fileDependencies,
                    missingFileDependencies,
                );
            }
        },
        onError: sessionErrorHandling,
    });
}

function *getBotPackages(action) {
    const {force, fileIds, label, callback} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_BOT_PACKAGES_GET,
        id: 'get-bot-packages',
        force,
        *onPending(signal) {
            const {packages} = yield call(API.getBotPackages, signal, fileIds, label);
            return {packageIds: packages.map(({id}) => id)};
        },
        *onDone({packageIds}) {
            if (callback) {
                callback(packageIds);
            }
        },
        onError: sessionErrorHandling,
    });
}

function *exportBots(action) {
    const {force, name, files, packageIds, password, label, includeGlobalValues} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_BOT_EXPORT,
        id: 'export',
        force,
        *onPending(signal) {
            let encryptedPassword;
            if (password) {
                encryptedPassword = yield call(encryptData, password);
            }
            yield call(API.exportBots, signal, name, files, packageIds, encryptedPassword, label, includeGlobalValues);
        },
        *onDone() {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: t('toast-title-export', {file: name}),
                message: t('toast-message-started'),
            }));
            yield put(routerPush('/bots/repository/public'));
        },
        onError: sessionErrorHandling,
    });
}

function *blmDownload(action) {
    const {downloadFile} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_BOT_BLM_DOWNLOAD,
        id: `blmDownload-${downloadFile}`,
        force: true,
        *onPending(signal) {
            const fileContent = yield call(API.blmDownload, signal, downloadFile);
            return {name: downloadFile, blob: fileContent};
        },
        *onDone() {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: t('toast-title-export', {file: `${window.atob(downloadFile)}.zip`}),
                message: t('toast-title-download'),
            }));
        },
        onError: sessionErrorHandling,
    });
}

function *importBots(action) {
    const {file, password, publicWorkspace, actionIfExisting, redirectWorkspace, includeGlobalValues} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_BOT_IMPORT,
        id: 'import',
        force: true,
        *onPending(signal) {
            let encryptedPassword;
            if (password) {
                encryptedPassword = yield call(encryptData, password);
            }
            yield call(API.importBots, signal, file, encryptedPassword, publicWorkspace, actionIfExisting, includeGlobalValues);
        },
        *onDone() {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: t('toast-title-import', {file: file.name}),
                message: t('toast-message-started'),
            }));
            yield put(routerPush(`/bots/repository/${redirectWorkspace}`));
        },
        onError: sessionErrorHandling,
    });
}

function *repositoriesGetCopyFileName(action) {
    const {folderId, fileId, callback} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_COPY_NAME_GET,
        id: 'get-copyFileName',
        force: true,
        *onPending(signal) {
            const {name} = yield call(API.getCopyFileName, signal, folderId, fileId);
            return {copyFileName: name};
        },
        *onDone({copyFileName}) {
            if (callback) {
                callback(copyFileName);
            }
        },
        onError: sessionErrorHandling,
    });
}

function *repositoriesCopyFile(action) {
    const {name, folderId, fileId, callback} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_FILE_COPY,
        id: `file-copy-${fileId}`,
        force: true,
        *onPending(signal) {
            const file = yield call(API.copyFile, signal, fileId, folderId, name);
            return ({file});
        },
        *onDone({file}) {
            const t = yield select(selectT);
            yield put(toastCreate({
                title: file.name,
                message: t('toast-message-created'),
            }));
            if (callback) {
                callback(file);
            }
        },
        onError: sessionErrorHandling,
    });
}

function *getDebugPoints(action) {
    const {force, fileId, callback} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_BOT_DEBUG_POINTS_GET,
        id: `get-debug-points-${fileId}`,
        force,
        *onPending(signal) {
            return yield call(API.getDebugPoints, signal, fileId);
        },
        *onDone(debugPoints) {
            if (callback) {
                callback(debugPoints);
            }
        },
        onError: sessionErrorHandling,
    });
}

function *setDebugPoints(action) {
    const {force, fileId, debugPoints} = action.payload;
    yield call(apiSaga, 'repositories', {
        name: actions.REPOS_BOT_DEBUG_POINTS_SET,
        id: `set-debug-points-${fileId}`,
        force,
        *onPending(signal) {
            yield call(API.setDebugPoints, signal, fileId, debugPoints);
        },
        onError: sessionErrorHandling,
    });
}

export function *reset() {
    yield put({type: actions.REPOS_RESET});
}

/* eslint-disable import/no-unused-modules */

export default function *() {
    yield takeEvery(actions.REPOS_FOLDER_LIST, folderList);
    yield takeEvery(actions.REPOS_FOLDER_CHILDREN, folderChildren);
    yield takeEvery(actions.REPOS_FOLDER_ANCESTORS, folderAncestors);
    yield takeEvery(actions.REPOS_FOLDER_GET, getFolder);
    yield takeEvery(actions.REPOS_FOLDER_DESTROY, destroyFolder);

    yield takeEvery(actions.REPOS_FILE_CREATE, createFile);
    yield takeEvery(actions.REPOS_FILE_UPLOAD, uploadFiles);
    yield takeEvery(actions.REPOS_FILE_UPDATE, updateFile);
    yield takeEvery(actions.REPOS_FILE_GET, getFile);
    yield takeEvery(actions.REPOS_FILE_DESTROY, destroyFile);
    yield takeEvery(actions.REPOS_FILE_TRY_CHECKOUT, tryCheckOutFile);
    yield takeEvery(actions.REPOS_FILE_CHECKOUT, checkOutFiles);
    yield takeEvery(actions.REPOS_FILE_CANCEL_CHECKOUT, cancelCheckOutFile);
    yield takeEvery(actions.REPOS_FILE_CHECK_CLONE, checkCloneFile);
    yield takeEvery(actions.REPOS_FILE_CLONE_DEPENDENCIES_GET, getCloneFileDependencies);
    yield takeEvery(actions.REPOS_FILE_CLONE, cloneFile);
    yield takeEvery(actions.REPOS_FILE_CHECKIN, checkInFiles);
    yield takeEvery(actions.REPOS_FILE_DESTROY_BATCH, destroyBatchFile);

    yield takeEvery(actions.REPOS_DEPENDENCIES_GET, getFileDependencies);

    yield takeEvery(actions.REPOS_FILE_INTERFACE_GET, getFileInterface);

    yield takeEvery(actions.REPOS_FILES_DEPENDENCIES_GET, getFilesDependencies);
    yield takeEvery(actions.REPOS_FILES_AND_DEPENDENCIES_GET, getFilesAndDependencies);

    yield takeEvery(actions.REPOS_BOT_PACKAGES_GET, getBotPackages);
    yield takeEvery(actions.REPOS_BOT_EXPORT, exportBots);
    yield takeEvery(actions.REPOS_BOT_BLM_DOWNLOAD, blmDownload);
    yield takeEvery(actions.REPOS_BOT_IMPORT, importBots);
    yield takeEvery(actions.REPOS_FILE_COPY_NAME_GET, repositoriesGetCopyFileName);
    yield takeEvery(actions.REPOS_FILE_COPY, repositoriesCopyFile);

    yield takeEvery(actions.REPOS_BOT_DEBUG_POINTS_GET, getDebugPoints);
    yield takeEvery(actions.REPOS_BOT_DEBUG_POINTS_SET, setDebugPoints);
}
