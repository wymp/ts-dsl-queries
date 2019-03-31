# DSL Queries

This is a library that makes handling incoming DSL filter queries easier. It is intended to be used to parse and validate the `filter` parameter of an API GET request, where that filter parameter is a JSON-serialized object representing

- A `QueryLeaf` object;
- A `QueryNode` object (assumes 'and' as logical operator); or
- A `DslQuery` object (again, assumes 'and' if no `o` value provided)

This library allows you to specify incoming field names and the acceptable operators that can be used with those fields (falling back on defaults), then form the query into a well-formed datasource query string with parameters (defaults to SQL).

## To-Do

- Add optional value constraints to QuerySpec object
