import { ZodError } from 'zod';
export class ApiError extends Error {
    status;
    code;
    details;
    retryAfter;
    constructor(status, code, message, details, retryAfter){
        super(message), this.status = status, this.code = code, this.details = details, this.retryAfter = retryAfter;
    }
}
export const notFound = ()=>new ApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy tài nguyên');
export const invalid = (field = 'body', code = 'INVALID_VALUE')=>new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [
        {
            field,
            code
        }
    ]);
export const tooLarge = ()=>new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu vượt giới hạn cho phép');
export const unsupported = ()=>new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Định dạng không được hỗ trợ');
export const errorHandler = (error, _req, res, next)=>{
    if (res.headersSent) {
        next(error);
        return;
    }
    let failure;
    if (error instanceof ApiError) failure = error;
    else if (error instanceof ZodError) failure = new ApiError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', error.issues.map((i)=>({
            field: i.path.join('.') || 'body',
            code: i.code
        })));
    else if (error?.type === 'entity.too.large') failure = tooLarge();
    else if (error?.type === 'entity.parse.failed' || error?.type === 'request.aborted') failure = invalid();
    else if (error?.status === 415) failure = unsupported();
    else {
        console.error(JSON.stringify({
            event: 'request_failed',
            requestId: res.locals.requestId
        }));
        failure = new ApiError(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi nội bộ');
    }
    if (failure.retryAfter) res.setHeader('Retry-After', failure.retryAfter);
    res.status(failure.status).json({
        success: false,
        error: {
            code: failure.code,
            message: failure.message,
            ...failure.details ? {
                details: failure.details
            } : {}
        },
        requestId: res.locals.requestId
    });
};
