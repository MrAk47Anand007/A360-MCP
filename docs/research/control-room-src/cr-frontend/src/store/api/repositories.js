/**
 * Copyright (c) 2020 Automation Anywhere.
 * All rights reserved.
 *
 * This software is the proprietary information of Automation Anywhere.
 * You shall use it only in accordance with the terms of the license agreement
 * you entered into with Automation Anywhere.
 */

import {getApiPoller} from '@automationanywhere/rio-components';

import {
    METHOD_GET, METHOD_PUT, METHOD_POST, METHOD_DELETE,
    MIME_TYPE_JSON,
    MIME_TYPE_TEXT,
} from '../constants/api';
import {
    getHeadersAuthLanguageNoCache,
    getHeadersSend,
    getHeadersReceive,
    getHeadersSendReceive,
    getHeadersRequestId,
} from '../selectors/api';
import {withQuery} from '../../util/query';

import {apiHandleNetworkError, apiHandleResponse} from './utils';

/**
  * Get the version query parameters for a file.
  * @param {string} versionLabel - The version label
  * @param {string} versionNumber - The version number (which should be a number greater than 0)
  * @param {boolean} validate - Whether to validate if the file is already in the check-in process
  * @returns {object} - The query params with either version or label
  */
const getVersionQuery = (versionLabel, versionNumber, versionComputeByLabel, validate) => {
    const query = {};

    if (versionNumber > 0) {
        query.version = String(versionNumber);
    }
    else if (versionLabel) {
        query.label = versionLabel;
    }
    else if (versionComputeByLabel) {
        query.computeByLabel = versionComputeByLabel;
    }

    if (validate) {
        query.validate = validate;
    }

    return query;
};

// FOLDERS --------------------------------------------------------------------------------------

const getDefaultFolders = (signal) =>
    fetch('/v2/repository/workspace/defaults', {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFolderAliasMappings = (signal) =>
    fetch('/v2/repository/folders/aliasmappings', {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getFolders = (signal, workspaceName) =>
    fetch(`/v2/repository/workspaces/${workspaceName}/folders`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getFolderChildren = (signal, folderId) =>
    fetch(`/v2/repository/folders/${folderId}/children`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getFolderAncestors = (signal, folderId) =>
    fetch(`/v2/repository/folders/${folderId}/ancestors`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getFolderChildrenList = (signal, folderId, options, versionLabel, searchWithinSubFolders) =>
    fetch(withQuery(`/v2/repository/folders/${folderId}/list`, {
        ...getVersionQuery(versionLabel),
        ...(searchWithinSubFolders ? {searchWithinSubFolders: true} : {}),
    }), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getTaskbotVersionLabels = (signal) =>
    fetch('/v2/repository/files/version/labels', {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let assignTaskbotVersionLabel = (signal, fileId, versionLabel, versionNumber) =>
    fetch('/v2/repository/files/version/assignLabel', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({fileId, label: versionLabel, versionNumber}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileVersionList = (signal, fileId, options) =>
    fetch(`/v2/repository/files/${fileId}/versions/list`, {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getFolder = (signal, folderId) =>
    fetch(`/v2/repository/folders/${folderId}`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let createFolder = (signal, folder, parentId) =>
    fetch(`/v2/repository/folders/${parentId}`, {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(folder),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let updateFolder = (signal, folder) =>
    fetch(`/v2/repository/folders/${folder.id}`, {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(folder),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let destroyFolder = (signal, folderId) =>
    fetch(`/v2/repository/folders/${folderId}`, {
        signal,
        method: METHOD_DELETE,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let partitionRepository = (signal, folderId) =>
    fetch(`/v2/repository/folders/${folderId}/partition`, {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let destroyBatchFolder = (signal, fileIds) =>
    fetch('/v2/repository/folders/delete', {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSend(MIME_TYPE_JSON),
        },
        body: JSON.stringify({ids: fileIds}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getAllFilesList = (signal, workspaceName, options, versionLabel) =>
    fetch(withQuery(`/v2/repository/workspaces/${workspaceName}/files/list`, getVersionQuery(versionLabel)), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getAllFilesListV3 = (signal, workspaceName, options, versionLabel) =>
    fetch(withQuery(`/v3/repository/workspaces/${workspaceName}/files/list`, getVersionQuery(versionLabel)), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getAllFilesComputeByLabelList = (signal, workspaceName, options, versionLabel) =>
    fetch(withQuery(`/v2/repository/workspaces/${workspaceName}/files/list`, getVersionQuery(null, null, versionLabel)), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getAllFilesComputeByLabelListV3 = (signal, workspaceName, options, versionLabel) =>
    fetch(withQuery(`/v3/repository/workspaces/${workspaceName}/files/list`, getVersionQuery(null, null, versionLabel)), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

// FINDER ----------------------------------------------------------------------------------------

const searchFinder = (signal, options, versionLabel) =>
    fetch(withQuery('/v2/repository/finder', getVersionQuery(versionLabel)), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

// FILES ----------------------------------------------------------------------------------------

let getFile = (signal, fileId, versionLabel, versionNumber, validate) =>
    fetch(withQuery(`/v2/repository/files/${fileId}`, getVersionQuery(versionLabel, versionNumber, null, validate)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileByPath = (signal, workspaceName, path, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/workspaces/${workspaceName}/files/bypath`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({path}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFilePair = (signal, fileId) =>
    fetch(`/v2/repository/files/${fileId}/filePair`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getPublicFileComparisonReport = (signal, fileId, sourceVersion, targetVersion) =>
    getApiPoller(
        signal,
        (requestId) => fetch(`/v3/repository/files/public/${fileId}/diff`, {
            signal,
            method: METHOD_POST,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
            body: JSON.stringify({
                sourceVersion,
                targetVersion,
            }),
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

const getPrivateFileComparisonReport = (signal, sourceId, sourceVersion, targetId, targetVersion) =>
    getApiPoller(
        signal,
        (requestId) => fetch(`/v3/repository/files/public/${sourceId}/private/${targetId}/diff`, {
            signal,
            method: METHOD_POST,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
            body: JSON.stringify({
                sourceVersion,
                targetVersion,
            }),
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

const getRequestStatus = (signal, requestId) =>
    fetch(`/v3/repository/requests/${requestId}`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let createFile = (signal, file) => {
    return fetch('/v2/repository/files', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(file),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);
};

const createFileFromTemplate = (signal, templateId, parentFolderId, contentType, name, description) =>
    getApiPoller(
        signal,
        (requestId) => fetch(`/v3/repository/files/${templateId}/createFromTemplate`, {
            signal,
            method: METHOD_POST,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
            body: JSON.stringify({
                parentFolderId,
                contentType,
                name,
                description,
            }),
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

let updateFile = (signal, file) =>
    fetch(`/v2/repository/files/${file.id}`, {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(file),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let uploadFile = (signal, folderId, file, type, description = '') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('contentType', type);
    formData.append('description', description);
    return fetch(`/v2/repository/files/${folderId}/content`, {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
        body: formData,
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);
};

let destroyFile = (signal, fileId) =>
    fetch(`/v2/repository/files/${fileId}`, {
        signal,
        method: METHOD_DELETE,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let destroyBatchFile = (signal, fileIds) =>
    fetch('/v2/repository/files/delete', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSend(MIME_TYPE_JSON),
        },
        body: JSON.stringify({ids: fileIds}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

// FILE CONTENT ---------------------------------------------------------------------------------

const getFileInterface = (signal, fileId, fileType, versionLabel, versionNumber) =>
    fetch(withQuery(`/v1/filecontent/${fileId}/interface`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(fileType),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFilePromptInterface = (signal, fileId, versionLabel, versionNumber) =>
    fetch(withQuery(`/gai/prompttools/v1/filecontent/${fileId}/automation/interface`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileContent = (signal, fileId, fileType, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/content`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(fileType),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileContentWithHeader = (signal, fileId, fileType, versionLabel, versionNumber) =>
    fetch(
        withQuery(`/v2/repository/files/${fileId}/content`, getVersionQuery(versionLabel, versionNumber)),
        {
            signal,
            method: METHOD_GET,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersReceive(fileType),
            },
        },
    )
        .catch(apiHandleNetworkError)
        .then((response) => {
            if (!response) {
                return {data: null, headers: null, status: 0};
            }

            return response.json().then((data) => ({
                data,
                headers: response.headers,
                status: response.status,
            }));
        });

const downloadFileContent = (signal, fileId, fileType) =>
    fetch(`/v3/repository/files/${fileId}/content`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(fileType),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileContentImage = (signal, fileId, fileType, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/content`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(fileType),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileContentText = (signal, fileId, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/content`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_TEXT),
        },
    })
        .catch(apiHandleNetworkError)
        .then((response) => {
            if (response.ok) {
                return response.text();
            }

            return apiHandleResponse(response);
        });

const updateFileContent = (signal, fileId, fileType, content, hasErrors) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/content`, {
        hasErrors: Boolean(hasErrors),
    }), {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSend(fileType),
        },
        body: JSON.stringify(content),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const updateFileContentText = (signal, fileId, text, hasErrors) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/content`, {
        hasErrors: Boolean(hasErrors),
    }), {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSend(MIME_TYPE_TEXT),
        },
        body: text,
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getUpdatedFileContent = (signal, fileId, packages) =>
    getApiPoller(
        signal,
        (requestId) => fetch(`/v3/repository/files/${fileId}/packagesVersionUpdate`, {
            signal,
            method: METHOD_POST,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
            body: JSON.stringify({packageInfo: packages}),
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

// FILE METADATA --------------------------------------------------------------------------------

const getFileMetadata = (signal, fileId, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/metadata`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileMetadataFile = (signal, fileId, path, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/metadata/file`, {
        path,
        ...getVersionQuery(versionLabel, versionNumber),
    }), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileMetadataContent = (signal, fileId, path, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/metadata/content`, {
        path,
        ...getVersionQuery(versionLabel, versionNumber),
    }), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

// FILE DEPENDENCIES ----------------------------------------------------------------------------

let getFileDependencies = (signal, fileId, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/dependencies`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileDependenciesFullGraph = (signal, fileId, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/dependencies/fullgraph`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileChildrenDependencies = (signal, fileId, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/children`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getFileParentsDependencies = (signal, fileId, versionLabel, versionNumber) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/parents`, getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const updateFileDependencies = (signal, fileId, dependencyIds) =>
    fetch(`/v2/repository/files/${fileId}/dependencies`, {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({childFileIds: dependencyIds}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getFilesDependencies = (signal, fileIds, versionLabel) =>
    fetch(withQuery('/v2/repository/dependencies', getVersionQuery(versionLabel)), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({fileIds}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

// CHECK IN/OUT FILES ---------------------------------------------------------------------------

const checkOutFiles = (signal, fileId, dependencyIds = [], versionNumber = 0) =>
    fetch(`/v2/repository/checkout/${fileId}`, {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({
            ids: dependencyIds,
            versionNumber,
        }),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const checkOutFileVersions = (signal, fileId, files = [], versionNumber = 0) =>
    fetch(`/v3/repository/checkout/${fileId}`, {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({
            files,
            versionNumber,
        }),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const cancelCheckOutFile = (signal, fileId) =>
    fetch('/v2/repository/checkoutCancel', {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({ids: [fileId]}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const revertEditCheckOutFile = (signal, fileId) =>
    fetch(`/v2/repository/checkoutRevert/${fileId}`, {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const checkCloneFile = (signal, fileId, validateDependencies) =>
    getApiPoller(
        signal,
        (requestId) => fetch(withQuery(`/v3/repository/files/${fileId}/clone/validate`, {
            validateDependencies,
        }), {
            signal,
            method: METHOD_GET,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersReceive(MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

const checkCheckOutFile = (signal, fileId, version, validateDependencies) =>
    getApiPoller(
        signal,
        (requestId) => fetch(withQuery(`/v3/repository/files/${fileId}/checkout/validate`, {
            version: !isNaN(version) ? version : null,
            validateDependencies,
        }), {
            signal,
            method: METHOD_GET,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersReceive(MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

let cloneFile = (signal, fileId) =>
    fetch(`/v2/repository/files/${fileId}/clone`, {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const checkInFiles = (signal, fileIds, excludedFileIds, description) =>
    getApiPoller(
        signal,
        (requestId) => fetch('/v3/repository/checkin', {
            signal,
            method: METHOD_PUT,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
            body: JSON.stringify({ids: fileIds, excludedIds: excludedFileIds, comment: description}),
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

const batchCheckInFiles = (signal, parentFileIds, comment) =>
    getApiPoller(
        signal,
        (requestId) => fetch('/v3/repository/bulkCheckin', {
            signal,
            method: METHOD_PUT,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
            body: JSON.stringify({parentFileIds, comment}),
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

const batchCheckOutFiles = (signal, parentFileIds, dependentCheckoutIds) =>
    fetch('/v2/repository/bulkCheckout', {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({parentFileIds, dependentCheckoutIds}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const batchValidateFiles = (signal, fileIds, operation) =>
    getApiPoller(
        signal,
        (requestId) => fetch('/v3/repository/files/validate', {
            signal,
            method: METHOD_POST,
            headers: {
                ...getHeadersAuthLanguageNoCache(),
                ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
                ...getHeadersRequestId(requestId),
            },
            body: JSON.stringify({ids: fileIds, operation}),
        })
            .catch(apiHandleNetworkError)
            .then(apiHandleResponse),
    );

const getBotCodeAnalysisReport = (signal, fileId, versionLabel, versionNumber) =>
    fetch('/v2/policy/bot/analysis/details', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({
            fileId,
            excludeChildBots: true,
            label: versionLabel,
            versionNumber,
        }),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getBotPackages = (signal, fileIds, versionLabel, versionNumber) =>
    fetch(withQuery('/v2/blm/botpackages', getVersionQuery(versionLabel, versionNumber)), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({fileIds}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const exportBots = (signal, name, files, packageIds, archivePassword, versionLabel, includeGlobalValues) =>
    fetch('/v2/blm/export/version', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({name, files, packageIds, archivePassword, label: versionLabel, includeGlobalValues}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const importBots = (signal, file, archivePassword, publicWorkspace, actionIfExisting, includeGlobalValues) => {
    const formData = new FormData();
    formData.append('upload', file);
    if (archivePassword) {
        formData.append('archivePassword', archivePassword);
    }
    formData.append('publicWorkspace', publicWorkspace);
    formData.append('actionIfExisting', actionIfExisting);
    formData.append('includeGlobalValues', includeGlobalValues);
    return fetch('/v2/blm/import', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
        body: formData,
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);
};

const promoteBots = (signal, payload) =>
    fetch('/v2/blm/promoteBot', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(payload),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getSourceUserList = (signal, options) =>
    fetch(withQuery('/v2/repository/users/list', {deleted: true}), {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getTargetUserList = (signal, options) =>
    fetch('/v2/repository/users/list', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(options),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const recoverRepository = (signal, payload) =>
    fetch('/v2/repository/recover', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(payload),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const generateAutomation = (signal, payload) =>
    fetch('/gai/apt/v2/transformer', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(payload),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const blmDownload = (signal, fileName) =>
    fetch(`/v2/blm/download/${encodeURIComponent(fileName)}`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const blmStatus = (signal, requestId) =>
    fetch(`/v2/blm/status/${requestId}`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getCopyFileName = (signal, parentId, fileId) =>
    fetch(withQuery(`/v2/repository/files/${fileId}/copy/name`, {
        parentId,
    }), {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let copyFile = (signal, fileId, parentId, name, description = null, destinationContentType = null) =>
    fetch(`/v2/repository/files/${fileId}/copy`, {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({name, parentId, description, destinationContentType}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const copyMetadata = (signal, sourceFileId, sourceMetadataNames, targetFileId) =>
    fetch(`/v2/repository/files/${sourceFileId}/copyMetadata`, {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({
            targetFileId,
            metadataNames: sourceMetadataNames,
            overwrite: false,
        }),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getNearestFolder = (signal, workspaceName, path) =>
    fetch(`/v2/repository/workspaces/${workspaceName}/folder/nearest`, {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({path}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getGitRestoreStatus = (signal) =>
    fetch('/v2/repository/gitrestore/status', {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const gitRestore = (signal, payload) =>
    fetch('/v2/repository/gitrestore', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({...payload}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const gitReset = (signal) =>
    fetch('/v2/repository/gitrestore/reset', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const gitRetry = (signal, credential) =>
    fetch('/v2/repository/gitrestore/retry', {
        signal,
        method: METHOD_POST,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(credential),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const gitRestoreMarkCompleted = (signal) =>
    fetch('/v2/repository/gitrestore/done', {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

let getPromoteBotsAllowedUrls = (signal) =>
    fetch('/v2/blm/settings/allowedUrls', {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const updatePromoteBotsAllowedUrls = (signal, allowedUrls) =>
    fetch('/v2/blm/settings/allowedUrls', {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify({urls: allowedUrls}),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getBotPolicy = (signal, id) =>
    fetch(`/v3/repository/files/${id}/policy`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const getDebugPoints = (signal, fileId) =>
    fetch(`/v1/debugger/points/files/${fileId}`, {
        signal,
        method: METHOD_GET,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersReceive(MIME_TYPE_JSON),
        },
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

const setDebugPoints = (signal, fileId, debugPoints) =>
    fetch(`/v1/debugger/points/files/${fileId}`, {
        signal,
        method: METHOD_PUT,
        headers: {
            ...getHeadersAuthLanguageNoCache(),
            ...getHeadersSendReceive(MIME_TYPE_JSON, MIME_TYPE_JSON),
        },
        body: JSON.stringify(debugPoints),
    })
        .catch(apiHandleNetworkError)
        .then(apiHandleResponse);

if (process.env.NODE_ENV !== 'production') {
    const {hasMock, mockedFetchOrCallback} = require('../../util/mock');
    if (hasMock('repositories')) {
        const mock = require('../../mock/repositories');
        // FOLDERS
        getFolder = mockedFetchOrCallback(getFolder, mock.getFolder);
        getFolders = mockedFetchOrCallback(getFolders, mock.getFolders);
        getFolderChildren = mockedFetchOrCallback(getFolderChildren, mock.getFolderChildren);
        getFolderAncestors = mockedFetchOrCallback(getFolderAncestors, mock.getFolderAncestors);
        getFolderChildrenList = mockedFetchOrCallback(getFolderChildrenList, mock.getFolderList);
        createFolder = mockedFetchOrCallback(createFolder, mock.createFolder);
        updateFolder = mockedFetchOrCallback(updateFolder, mock.updateFolder);
        destroyFolder = mockedFetchOrCallback(destroyFolder, mock.destroyFolder);
        partitionRepository = mockedFetchOrCallback(partitionRepository, mock.partitionRepository);
        destroyBatchFolder = mockedFetchOrCallback(destroyBatchFolder, mock.destroyBatchFolder);
        // FILES
        createFile = mockedFetchOrCallback(createFile, mock.createFile);
        updateFile = mockedFetchOrCallback(updateFile, mock.updateFile);
        uploadFile = mockedFetchOrCallback(uploadFile, mock.uploadFile);
        getFile = mockedFetchOrCallback(getFile, mock.getFile);
        getAllFilesList = mockedFetchOrCallback(getAllFilesList, mock.getAllFilesList);
        destroyFile = mockedFetchOrCallback(destroyFile, mock.destroyFile);
        destroyBatchFile = mockedFetchOrCallback(destroyBatchFile, mock.destroyBatchFile);
        // DEPENDENCIES
        getFileDependencies = mockedFetchOrCallback(getFileDependencies, mock.getFileDependencies);
        getFilesDependencies = mockedFetchOrCallback(getFilesDependencies, mock.getFilesDependencies);
        // COPY FILE
        getCopyFileName = mockedFetchOrCallback(getCopyFileName, mock.getCopyFileName);
        copyFile = mockedFetchOrCallback(copyFile, mock.copyFile);
        cloneFile = mockedFetchOrCallback(cloneFile, mock.cloneFile);
        // GET TASKBOT VERSION LABELS AND ASSIGN LABELS
        getTaskbotVersionLabels = mockedFetchOrCallback(getTaskbotVersionLabels, mock.getTaskbotVersionLabels);
        assignTaskbotVersionLabel = mockedFetchOrCallback(assignTaskbotVersionLabel, mock.assignTaskbotVersionLabel);
        //BOT PROMOTION SETTINGS
        getPromoteBotsAllowedUrls = mockedFetchOrCallback(getPromoteBotsAllowedUrls, mock.getPromoteBotsAllowedUrls);
    }
}

export {
    getDefaultFolders,
    getFolderAliasMappings,
    getFolders,
    getFolderChildren,
    getFolderAncestors,
    getFolderChildrenList,
    createFolder,
    updateFolder,
    getFolder,
    destroyFolder,
    partitionRepository,
    destroyBatchFolder,

    getAllFilesList,
    getAllFilesListV3,
    getAllFilesComputeByLabelList,
    getAllFilesComputeByLabelListV3,

    searchFinder,

    getFile,
    getFileByPath,
    getFilePair,
    createFile,
    createFileFromTemplate,
    updateFile,
    uploadFile,
    destroyFile,
    destroyBatchFile,

    getPublicFileComparisonReport,
    getPrivateFileComparisonReport,
    getRequestStatus,

    getFileInterface,
    getFilePromptInterface,
    getFileContent,
    getFileContentWithHeader,
    downloadFileContent,
    getFileContentText,

    updateFileContent,
    getFileContentImage,
    updateFileContentText,
    getUpdatedFileContent,

    getFileMetadata,
    getFileMetadataFile,
    getFileMetadataContent,

    getFileDependencies,
    getFileDependenciesFullGraph,
    updateFileDependencies,
    getFileChildrenDependencies,
    getFileParentsDependencies,

    checkOutFiles,
    checkOutFileVersions,
    cancelCheckOutFile,
    revertEditCheckOutFile,
    checkInFiles,

    checkCloneFile,
    checkCheckOutFile,
    cloneFile,

    getFilesDependencies,
    getBotPackages,
    batchCheckInFiles,
    batchCheckOutFiles,
    batchValidateFiles,
    getBotCodeAnalysisReport,
    exportBots,
    importBots,
    promoteBots,
    getSourceUserList,
    getTargetUserList,
    recoverRepository,
    blmDownload,
    blmStatus,
    getCopyFileName,
    copyFile,
    copyMetadata,

    getNearestFolder,

    getGitRestoreStatus,
    gitRestore,
    gitReset,
    gitRetry,
    gitRestoreMarkCompleted,

    getTaskbotVersionLabels,
    assignTaskbotVersionLabel,
    getFileVersionList,

    getPromoteBotsAllowedUrls,
    updatePromoteBotsAllowedUrls,

    getBotPolicy,
    generateAutomation,

    getDebugPoints,
    setDebugPoints,
};
