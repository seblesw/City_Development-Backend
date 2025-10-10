
const progressMiddlewareSSE = (req, res, next) => {
  
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }

  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); 

  const totalBytes = parseInt(req.headers['content-length']) || 0;
  let uploadedBytes = 0;

  
  req.uploadProgress = {
    send: (type, data = {}) => {
      const messageData = {
        type,
        timestamp: Date.now(),
        ...data
      };
      
      res.write(`data: ${JSON.stringify(messageData)}\n\n`);
      
      
      if (typeof res.flush === 'function') {
        res.flush();
      }
    },
    
    
    progress: (percentage, message = '', extraData = {}) => {
      req.uploadProgress.send('progress', {
        percentage: Math.min(100, Math.max(0, percentage)),
        uploaded: uploadedBytes,
        total: totalBytes,
        message,
        ...extraData
      });
    },
    
    complete: (data = {}) => {
      req.uploadProgress.send('complete', {
        message: 'Upload and processing completed successfully',
        ...data
      });
    },
    
    error: (message, error = null) => {
      const errorData = {
        message,
        ...(error && { 
          error: process.env.NODE_ENV === 'development' 
            ? { message: error.message, stack: error.stack }
            : { message: error.message }
        })
      };
      
      req.uploadProgress.send('error', errorData);
    }
  };

  
  req.uploadProgress.progress(0, 'Starting upload...');

  
  req.on('data', (chunk) => {
    uploadedBytes += chunk.length;
    const percentage = totalBytes > 0 
      ? Math.round((uploadedBytes / totalBytes) * 100) 
      : 0;
    
    req.uploadProgress.progress(percentage, `Uploading: ${percentage}%`);
  });

  req.on('end', () => {
    req.uploadProgress.progress(100, 'Upload complete. Starting processing...');
  });

  next();
};

module.exports = progressMiddlewareSSE;