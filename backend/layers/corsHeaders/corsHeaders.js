const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

function prepareCorsHeaders(origin, allowedMethods = 'OPTIONS,GET') {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': allowedMethods, // Set allowed methods from the parameter
  };

  if (origin === ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = origin; // Set the specific origin
  } else if (ALLOWED_ORIGIN === "'*'") {
    headers['Access-Control-Allow-Origin'] = '*'; // Allow all origins
  } else {
    console.warn(`CORS Warning: Origin '${origin}' is not in the allowed origin: ${ALLOWED_ORIGIN}`);
  }

  return headers;
}

module.exports = { prepareCorsHeaders };
