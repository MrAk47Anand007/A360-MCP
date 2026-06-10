/**
 * Copyright (c) 2020 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

export const REPOS_FORM_VALUE_SET = 'REPOS_FORM_VALUE_SET';

export const REPOS_FOLDER_LIST = 'REPOS_FOLDER_LIST';
export const REPOS_FOLDER_CHILDREN = 'REPOS_FOLDER_CHILDREN';
export const REPOS_FOLDER_ANCESTORS = 'REPOS_FOLDER_ANCESTORS';
export const REPOS_FOLDER_GET = 'REPOS_FOLDER_GET';
export const REPOS_FOLDER_DESTROY = 'REPOS_FOLDER_DESTROY';
export const REPOS_FOLDER_RESET = 'REPOS_FOLDER_RESET';

export const REPOS_FILE_CREATE = 'REPOS_FILE_CREATE';
export const REPOS_FILE_UPDATE = 'REPOS_FILE_UPDATE';
export const REPOS_FILE_REPLACE_CONTENT = 'REPOS_FILE_REPLACE_CONTENT';
export const REPOS_FILE_UPLOAD = 'REPOS_FILE_UPLOAD';
export const REPOS_FILE_GET = 'REPOS_FILE_GET';
export const REPOS_FILE_DESTROY = 'REPOS_FILE_DESTROY';
export const REPOS_FILE_DESTROY_BATCH = 'REPOS_FILE_DESTROY_BATCH';
export const REPOS_FILE_CHECKOUT = 'REPOS_FILE_CHECKOUT';
export const REPOS_FILE_TRY_CHECKOUT = 'REPOS_FILE_TRY_CHECKOUT';
export const REPOS_FILE_CANCEL_CHECKOUT = 'REPOS_FILE_CANCEL_CHECKOUT';
export const REPOS_FILE_CLONE = 'REPOS_FILE_CLONE';
export const REPOS_FILE_CHECK_CLONE = 'REPOS_FILE_CHECK_CLONE';
export const REPOS_FILE_CLONE_DEPENDENCIES_GET = 'REPOS_FILE_CLONE_DEPENDENCIES_GET';
export const REPOS_FILE_CHECKIN = 'REPOS_FILE_CHECKIN';
export const REPOS_FILE_COPY_NAME_GET = 'REPOS_FILE_COPY_NAME_GET';
export const REPOS_FILE_COPY = 'REPOS_FILE_COPY';
export const REPOS_FILE_RESET = 'REPOS_FILE_RESET';

export const REPOS_DEPENDENCIES_GET = 'REPOS_DEPENDENCIES_GET';
export const REPOS_NESTED_DEPENDENCIES_GET = 'REPOS_NESTED_DEPENDENCIES_GET';
export const REPOS_DEPENDENCIES_OPEN = 'REPOS_DEPENDENCIES_OPEN';
export const REPOS_DEPENDENCIES_RESET = 'REPOS_DEPENDENCIES_RESET';

export const REPOS_BOT_EXPORT = 'REPOS_BOT_EXPORT';
export const REPOS_BOT_BLM_DOWNLOAD = 'REPOS_BOT_BLM_DOWNLOAD';
export const REPOS_BOT_BLM_DOWNLOAD_RESET = 'REPOS_BOT_BLM_DOWNLOAD_RESET';
export const REPOS_BOT_IMPORT = 'REPOS_BOT_IMPORT';

export const REPOS_FILES_DEPENDENCIES_GET = 'REPOS_FILES_DEPENCDENCIES_GET';
export const REPOS_FILES_AND_DEPENDENCIES_GET = 'REPOS_FILES_AND_DEPENDENCIES_GET';

export const REPOS_BOT_PACKAGES_GET = 'REPOS_BOT_PACKAGES_GET';

export const REPOS_FILE_INTERFACE_GET = 'REPOS_FILE_INTERFACE_GET';
export const REPOS_FILE_INTERFACE_UPDATE = 'REPOS_FILE_INTERFACE_UPDATE';
export const REPOS_FILE_INTERFACES_RESET = 'REPOS_FILE_INTERFACES_RESET';

export const REPOS_BOT_DEBUG_POINTS_GET = 'REPOS_BOT_DEBUG_POINTS_GET';
export const REPOS_BOT_DEBUG_POINTS_SET = 'REPOS_BOT_DEBUG_POINTS_SET';

export const REPOS_ERROR_RESET = 'REPOS_ERROR_RESET';
export const REPOS_RESET = 'REPOS_RESET';

export const formValueSet = (name, value) => ({
    type: REPOS_FORM_VALUE_SET,
    payload: {name, value},
});

// FOLDER ACTIONS --------------------------------------------------------
export const folderList = (workspaceName) => ({
    type: REPOS_FOLDER_LIST,
    payload: {workspaceName},
});

export const folderChildren = (workspaceName, folderId) => ({
    type: REPOS_FOLDER_CHILDREN,
    payload: {workspaceName, folderId},
});

export const folderAncestors = (workspaceName, folderId) => ({
    type: REPOS_FOLDER_ANCESTORS,
    payload: {workspaceName, folderId},
});

export const folderReset = () => ({
    type: REPOS_FOLDER_RESET,
    payload: {},
});

export const getFolder = (workspaceName, folderId) => ({
    type: REPOS_FOLDER_GET,
    payload: {workspaceName, id: folderId},
});

export const destroyFolder = (workspaceName, folder) => ({
    type: REPOS_FOLDER_DESTROY,
    payload: {workspaceName, folder},
});

// FILE ACTIONS --------------------------------------------------------
export const createFile = (workspaceName, file, content, dependencies, hasErrors, onComplete, onError) => ({
    type: REPOS_FILE_CREATE,
    payload: {workspaceName, file, content, dependencies, hasErrors, onComplete, onError},
});

export const updateFile = (workspaceName, file, content, dependencies, hasErrors, onComplete, onError) => ({
    type: REPOS_FILE_UPDATE,
    payload: {workspaceName, file, content, dependencies, hasErrors, onComplete, onError},
});

export const replaceFileContent = (content) => ({
    type: REPOS_FILE_REPLACE_CONTENT,
    payload: {content},
});

export const uploadFiles = (workspaceName, folderId, files, callback) => ({
    payload: {workspaceName, folderId, files, callback},
    type: REPOS_FILE_UPLOAD,
});

export const getFile = (workspaceName, id, content = false, dependencies = false, versionNumber) => ({
    type: REPOS_FILE_GET,
    payload: {workspaceName, id, content, dependencies, versionNumber},
});

export const getDebugPoints = (fileId, callback) => ({
    type: REPOS_BOT_DEBUG_POINTS_GET,
    payload: {fileId, callback},
});

export const setDebugPoints = (fileId, debugPoints) => ({
    type: REPOS_BOT_DEBUG_POINTS_SET,
    payload: {fileId, debugPoints},
});


export const fileReset = () => ({
    type: REPOS_FILE_RESET,
    payload: {},
});

export const tryCheckOutFile = (file) => ({
    type: REPOS_FILE_TRY_CHECKOUT,
    payload: {file},
});

export const checkOutFiles = (file, fileDependencies = null) => ({
    type: REPOS_FILE_CHECKOUT,
    payload: {file, fileDependencies},
});

export const cancelCheckOutFile = (file) => ({
    type: REPOS_FILE_CANCEL_CHECKOUT,
    payload: {file},
});

export const checkCloneFile = (file, callback) => ({
    type: REPOS_FILE_CHECK_CLONE,
    payload: {file, callback},
});

export const getCloneFileDependencies = (fileId) => ({
    type: REPOS_FILE_CLONE_DEPENDENCIES_GET,
    payload: {fileId},
});

export const cloneFile = (file, hasDependencies = false) => ({
    type: REPOS_FILE_CLONE,
    payload: {file, hasDependencies},
});

export const checkInFiles = (file, fileDependencies = null, comment) => ({
    type: REPOS_FILE_CHECKIN,
    payload: {file, fileDependencies, comment},
});

export const destroyFile = (workspaceName, file) => ({
    type: REPOS_FILE_DESTROY,
    payload: {workspaceName, file},
});

export const destroyBatchFile = (workspaceName, files) => ({
    type: REPOS_FILE_DESTROY_BATCH,
    payload: {workspaceName, files},
});

export const repositoriesGetCopyFileName = (folderId, fileId, callback) => ({
    type: REPOS_FILE_COPY_NAME_GET,
    payload: {folderId, fileId, callback},
});

export const repositoriesCopyFile = (name, folderId, fileId, callback) => ({
    type: REPOS_FILE_COPY,
    payload: {name, folderId, fileId, callback},
});

// TASKBOT VARIABLES ACTIONS --------------------------------------------------
export const getFileDependencies = (id, parentId = null, fullGraph = false) => ({
    type: REPOS_DEPENDENCIES_GET,
    payload: {id, parentId, fullGraph},
});

export const openDependency = (fileId, isOpen) => ({
    type: REPOS_DEPENDENCIES_OPEN,
    payload: {fileId, isOpen},
});

export const resetDependencies = () => ({
    type: REPOS_DEPENDENCIES_RESET,
});

// DEPENDENCY ACTIONS --------------------------------------------------
export const getFileInterface = (workspaceName, path, label, version, callback) => ({
    type: REPOS_FILE_INTERFACE_GET,
    payload: {workspaceName, path, label, version, callback},
});
export const updateFileInterface = (path, fileInterface) => ({
    type: REPOS_FILE_INTERFACE_UPDATE,
    payload: {path, fileInterface},
});

export const resetFileInterfaces = () => ({
    type: REPOS_FILE_INTERFACES_RESET,
});

export const errorReset = (...errorKeys) => ({
    type: REPOS_ERROR_RESET,
    payload: {errorKeys},
});

// EXPORT ACTIONS ------------------------------------------------------
export const getFilesDependencies = (fileIds, callback) => ({
    type: REPOS_FILES_DEPENDENCIES_GET,
    payload: {fileIds, callback},
});

export const getFilesAndDependencies = (workspaceName, fileIds, label, callback) => ({
    type: REPOS_FILES_AND_DEPENDENCIES_GET,
    payload: {workspaceName, fileIds, label, callback},
});

export const getBotPackages = (fileIds, label, callback) => ({
    type: REPOS_BOT_PACKAGES_GET,
    payload: {fileIds, label, callback},
});

export const exportBots = (name, files, packageIds, password, label, includeGlobalValues) => ({
    type: REPOS_BOT_EXPORT,
    payload: {name, files, packageIds, password, label, includeGlobalValues},
});

export const blmDownload = (downloadFile, callback) => ({
    type: REPOS_BOT_BLM_DOWNLOAD,
    payload: {downloadFile, callback},
});

export const blmDownloadReset = () => ({
    type: REPOS_BOT_BLM_DOWNLOAD_RESET,
});

export const importBots = (file, password, publicWorkspace, actionIfExisting, redirectWorkspace, includeGlobalValues) => ({
    type: REPOS_BOT_IMPORT,
    payload: {file, password, publicWorkspace, actionIfExisting, redirectWorkspace, includeGlobalValues},
});
