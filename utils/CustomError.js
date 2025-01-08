// backend/utils/CustomError.js

class CustomError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.name = 'CustomError';
      this.statusCode = statusCode;
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  export default CustomError;
  