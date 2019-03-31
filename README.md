# Http Errors

This is a small library that presents a set of pre-configured errors that correspond to some common HTTP status codes, such as 400, 401, 403, 404, 500, etc....

The idea is that you can throw these like normal errors in your code, but then use them to fine-tune your actual HTTP response in a global handler function. For example, using express:

```ts
import * as express from "express";
import * as errors from "http-errors";
import { authenticate } from "./Authnz";

const app = express();

// Normal endpoint
app.get("/my/endpoint", function(req, res, next) {
  try {
    if (!req.headers("Authorization")) {
      throw new errors.Unauthorized(
        "You must pass a standard Authorization header to use this endpoint",
        "MissingAuthHeader"
      );
    }

    // May throw errors.Forbidden
    authenticate(req.headers("Authorization"));

    return res.status(200).send({ data: "Yay!" });
  } catch (e) {
    next(e);
  }
});

// Global handler, handling errors for all endpoints
app.use(function(e: Error, req, res, next) {
  // If it's not already an HttpError, convert it into an InternalServerError (500)
  if (!errors.isHttpError(e)) {
    e = errors.InternalServerError.fromError(e);
  }

  // This happens to be JSON:API structure, but you could use the data however you'd like
  return res.status(e.status).send({
    errors: [
      {
        status: e.status,
        code: e.code!,
        title: e.title,
        detail: e.message
      }
    ]
  });
});
```
