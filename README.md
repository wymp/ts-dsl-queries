DSL Queries
==========================================================================

This library was intended to make general data filter queries more manageable. The problems
it attempts to solve are that, when we request data from some datasource (say, a REST API or
a database), a) that request should be agnostic about the underlying datasource implementation,
but often isn't; and b) we want to be able to validate the incoming query to both offer useful
feedback to the user about how to make the query valid, and also to ensure that the service is
not being abused.

To that end, this library codifies a general "parse tree" data structure written in JSON
that can be used to easily understand an incoming query. The query would take the form of

- A single `QueryLeaf` object;
- A single `QueryNode` object (assumes 'and') with one or more `QueryLeaf`s; or
- A full `DslQuery` object (again, assumes 'and' if no `o` value provided)

For reference, the above objects are defined as follows:

```ts
QueryLeaf = [FieldName, ComparisonOperator, Value | Array<Value>];

QueryNode = Array<QueryLeaf | DslQueryData>;

DslQueryData {
  o: "and" | "or";
  v: QueryNode;
}

// Value is a short-hand alias:
Value = string | number | boolean | null;
```

A query can be as simple as `["myField","=","someval"]`, but it can also be more complex.
A query of medium complexity might be, for example,
`[["myField","=","someval"],["otherfield","!=","otherval"]]`. In this case, "and" is the implied
logical operator. Finally, you can write very complex queries like, for example, this one:

```ts
{
  o: "and",
  v: [
    ["name", "=", "test"],
    {
      o: "or",
      v: [
        ["age", ">", 30],
        ["status", "in", ["deceased", "disabled"]],
        {
          o: "and",
          v: [["parent", "in", ["bob", "tammy"]], ["status", "=", "youthful"]]
        }
      ]
    }
  ]
}
```

This translates to the following more "human-readable" form:

```
name = "test" &&
(
  age > 30 ||
  status in ("deceased", "disabled") ||
  (
    status === "youthful"
    parent in ("bob", "tammy") &&
  )
)
```

On the back-end, the library allows you to specify constraints on the incoming query, including
valid field names and the acceptable operators that can be used with those fields (falling back
on defaults). It also provides functionality for translating the query into a well-formed,
implementation-specific query string with parameters, such as a sql query (default).


## Examples

On the front-end, you might do something like this (pseudo-code):

```ts
const response = await request("GET", "https://my.api.com/users", {
  params: [
    [ "filter", JSON.stringify(["email", "like", "%example.com"]) ]
  ]
});

// use response.....
```

On the back-end, when you receive this query, you might do something like this:

```ts
import * as Errors from "@openfinance/http-errors";
import { DslQuery } from "@openfinance/dsl-queries";

// ....

// Define what fields are allowed, and which operators are allowed for those fields.
// Note that the library has some knowledge of what values are valid for each
// operator type. For example, "in" can accept an array of values, while "=" cannot and
// will throw an exception.
const filterSpec = {
  fieldSpecs: {
    "name": ["=", "!="],
    "email": ["=", "!=", "in", "like", "not like"]
  }
}

try {
  const filter = new DslQuery(req.params.filter, filterSpec);

  // The user may not have passed a filter at all, so we need to check for that
  if (filter) {
    // Maybe do a little sanity checking?
    if (filter.has("name") && filter.has("email")) {
      throw new Errors.BadQuery("Can't query both name and email (BS example, whatever)", "NameAndEmail");
    }
  }

  const sql = filter.toString(); // returns `[ "email like ?", ["%example.com"]]`
  const result = await someDatasource.query(sql[0], sql[1]);
  res.code(200).send({
    data: result
  });
} catch (e) {
  // DslQuery will throw an HttpError (from [@openfinance/http-errors](https://www.npmjs.com/package/@openfinance/http-errors))
  // If not that, just convert it for easy responses
  if (!Errors.isHttpError(e)) {
    e = Errors.InternalServerError.fromError(e);
  }

  // Return an error response
  res.code(e.status).send({
    errors: e.obstructions.length > 0
      ? e.obstructions.map((o) => { code: o.code, title: e.name, detail: o.text })
      : [{ code: e.code, title: e.name¸ detail: e.message }]
  });
}
```

The above code handles a considerable amount of validation for you. If the user passes in a
random string, it throws a useful error explaining what it's expecting instead. If the user
passes in malformed JSON, it lets them know. If the user passes in unacceptable fields or 
operators that aren't available for a given field, it tells them what the problem is.

Currently, however, there is no way to do value validations, nor is it particularly easy to make
sense of complex queries. For example, if a user passes in a query like
`[["name","=","me"],["name","!=","me"]]`, there is currently no general method that the library
uses to flag that this query is a no-op, and so it would simply pass the query on to the
datasource and you would never get any results.

## To-Do

- Add optional value constraints to QuerySpec object

