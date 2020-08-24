/**
 * RPC request wrapper.
 *
 * @module test/lib/rpc
 */

'use strict';

/**
 * RPC request wrapper.
 *
 * @param  {Object}   request Request method of RPC client.
 * @param  {String}   method  Name of the RPC method to call.
 * @param  {?Object}  params  Array of arguments for called method.
 * @param  {Number}   [id=1]  Request ID.
 * @return {Promise}          Response result.
 */
module.exports = function rpc(request, method, params, id = 1) {
    return request(method, params, id)
        .then(function onSuccess(res) {
            if (!res || !res.result || res.error) {
                throw res && res.error || 'RPC responded with null';
            }

            return res.result;
        });
};
