import {
  FieldName,
  ComparisonOperator,
  Value,
  QueryLeaf,
  QueryNode,
  DslQuery,
  QuerySpec,
  ObstructionInterface,
  TranslatorFunction
} from "./Types";

// Internal

const isArray = function<T>(a: any): a is Array<T> {
  return Array.isArray(a);
};

const isQueryLeaf = function(q: any): q is QueryLeaf {
  return (
    isArray(q) &&
    q.length === 3 &&
    typeof q[0] === "string" &&
    typeof q[1] === "string" &&
    (typeof q[2] === "string" || isArray(q[2]))
  );
};

const isQueryNode = function(q: any): q is QueryNode {
  return isArray(q) && (q.length === 0 || isQueryLeaf(q[0]) || isQuery(q[0]));
};

const isQuery = function(q: any, lite: boolean = false): q is DslQuery {
  if (lite) {
    return typeof q === "object" && q.hasOwnProperty("v");
  } else {
    return typeof q === "object" && q.hasOwnProperty("v") && isQueryNode(q["v"]);
  }
};

const isQuerySpec = function(spec: any): spec is QuerySpec {
  if (typeof spec !== "object") {
    throw new Error(`Invalid QuerySpec: QuerySpec must be an object.`);
  }

  const invalidKeys: Array<string> = [];
  Object.keys(spec).forEach(k => {
    if (["fieldSpecs", "defaultComparisonOperators"].indexOf(k) === -1) {
      invalidKeys.push(k);
    }
  });

  if (invalidKeys.length > 0) {
    throw new Error(`Invalid QuerySpec: Invalid keys found: '${invalidKeys.join("', '")}'`);
  }

  if (!spec.hasOwnProperty("defaultComparisonOperators")) {
    throw new Error("Invalid QuerySpec: Missing 'defaultComparisonOperators' array");
  }

  if (!isArray(spec.defaultComparisonOperators)) {
    throw new Error("Invalid QuerySpec: 'defaultComparisonOperators' must be an array.");
  }

  if (
    (spec.hasOwnProperty("fieldSpecs") && typeof spec.fieldSpecs !== "object") ||
    isArray(spec.fieldSpecs)
  ) {
    throw new Error(
      "Invalid QuerySpec: 'fieldSpecs' must be a map of field names to arrays of acceptable " +
        "comparison operators for the given field."
    );
  }

  return true;
};

const validateDslQueryOperator = function(
  operator: string,
  validOperators: Array<string>
): Array<ObstructionInterface> {
  if (["and", "or"].indexOf(operator) === -1) {
    return [
      {
        code: "DslQueryInvalidOperator",
        text: `You may only use 'and' or 'or' as the operator in a DslQuery. You passed '${operator}'`
      }
    ];
  } else {
    return [];
  }
};

const validateDslQueryValue = function(
  val: QueryNode,
  querySpec: QuerySpec
): Array<ObstructionInterface> {
  let o: Array<ObstructionInterface> = [];

  if (val.length === 0) {
    return o;
  }

  for (let next of val) {
    // If it's a full query, recurse
    if (isQuery(next, true)) {
      o = o.concat(validateDslQueryValue(next.v, querySpec));
    } else {
      let checkOperator: boolean = true;
      let operatorSet: Array<string> = querySpec.defaultComparisonOperators;

      // Otherwise, if we've provided field specs, enforce them
      if (querySpec.fieldSpecs) {
        // If the given field is not in the field specs, it's invalid
        if (!querySpec.fieldSpecs.hasOwnProperty(next[0])) {
          o.push({
            code: "InvalidDslQueryField",
            text:
              `'${next[0]}' is not a valid field for this DslQuery. Valid fields are ` +
              `'${querySpec.fieldSpecs.keys.join("', '")}'`
          });
          checkOperator = false;
        } else {
          if (querySpec.fieldSpecs[next[0]].length > 0) {
            operatorSet = querySpec.fieldSpecs[next[0]];
          }
        }
      }

      // If we're checking the operator, check it
      if (checkOperator && operatorSet.indexOf(next[1]) === -1) {
        o.push({
          code: "InvalidDslQueryComparisonOperator",
          text:
            `'${next[1]}' is not a valid operator for the '${next[0]}' field of this ` +
            `DslQuery. Valid operators are '${operatorSet.join("', '")}'`
        });
      }

      // Finally, brief check on the value

      const getValueObstructions = function(
        field: string,
        val: any,
        valIndex?: number
      ): Array<ObstructionInterface> {
        if (val !== null && ["string", "number", "boolean"].indexOf(typeof val) === -1) {
          const index = valIndex ? ` (argument #${valIndex + 1})` : "";
          return [
            {
              code: "InvalidDslQueryValue",
              text:
                `Field '${field}'${index}: You've passed an invalid value. Valid values must ` +
                `be null, string, number, or boolean. You passed '${JSON.stringify(val)}'.`
            }
          ];
        } else {
          return [];
        }
      };

      // If the value is an array....
      const val = next[2];
      if (isArray(val)) {
        // If 0-length, that's an obstruction
        if (val.length === 0) {
          o.push({
            code: "InvalidDslQueryValue",
            text: `Field '${next[0]}': You've supplied an array of values, but it was empty.`
          });

          // Otherwise....
        } else {
          // Make sure the operator supports arrays
          if (next[1] !== "in" && next[1] !== "not in") {
            o.push({
              code: "InvalidDslQueryValue",
              text:
                `Field '${next[0]}': You've supplied an array of values, but used ` +
                `a comparison operator other than 'in' or 'not in' (you used '${next[1]}'). ` +
                `Arrays of values may only be used with operators 'in' or 'not in'`
            });

            // If all is cool so far, check each value of the array
          } else {
            for (let i = 0; i < val.length; i++) {
              o = o.concat(getValueObstructions(next[0], val[i], i));
            }
          }
        }

        // If the value is NOT an array, just check it
      } else {
        o = o.concat(getValueObstructions(next[0], next[2]));
      }
    }
  }

  return o;
};

// External

export const dslQueryDefaultComparisonOperators = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "regexp",
  "not regexp",
  "like",
  "not like",
  "in",
  "not in"
];

export const defaultTranslatorFunction: TranslatorFunction = function(
  leaf: QueryLeaf
): [string, Array<Value>] {
  let queryString: string = `${leaf[0]} ${leaf[1]}`;
  const params: Array<Value> = [];

  // If it's an array, the next part is a parenthesitized list of placeholders
  const val = leaf[2];
  if (isArray<Value>(val)) {
    const placeholders: "?"[] = [];
    for (let v of val) {
      placeholders.push("?");
      params.push(v);
    }
    queryString += " (" + placeholders.join(", ") + ")";

    // Otherwise, the next part is just a single placeholder
  } else {
    queryString += "?";
    params.push(val);
  }

  return [queryString, params];
};

export const parseDslQuery = function(q: any, querySpec: object = {}): DslQuery | null {
  if (q === null || (typeof q === "string" && q.trim() === "")) {
    return null;
  }

  // Validate Query Spec
  if (!querySpec.hasOwnProperty("defaultComparisonOperators")) {
    (querySpec as any).defaultComparisonOperators = dslQueryDefaultComparisonOperators;
  }
  if (!isQuerySpec(querySpec)) {
    // NOTE: because isQuerySpec throws errors, this will never execute (but that's alright)
    throw new Error("Invalid QuerySpec");
  }

  // Capture original query for error reporting
  const orig = typeof q === "string" ? q : JSON.stringify(q);

  // Parse into object, if necessary
  if (typeof q === "string") {
    try {
      q = JSON.parse(q.trim());
    } catch (e) {
      throw new Error(
        `The query you've passed does not appear to be valid JSON: ${e.message}. Original ` +
          `query:\n\n${orig}`
      );
    }
  }

  // Initial query validations
  if (typeof q !== "object" || q === null) {
    throw new Error(
      "The query you've passed does not appear to be valid. It should have parsed to a valid " +
        `JSON object or array, but didn't. Original query: '${orig}'`
    );
  }

  // Normalize Query
  if (isQueryLeaf(q)) {
    q = {
      o: "and",
      v: [q]
    };
  } else if (isQueryNode(q)) {
    q = {
      o: "and",
      v: q
    };
  } else if (isQuery(q)) {
    if (!q.o) {
      q.o = "and";
    }
    q.o = <"and" | "or">q.o.toLowerCase();
  } else {
    throw new Error(
      "The query you've passed does not appear to be valid. It should either be a DslQueryLeaf, " +
        `a DslQueryNode, or a DslQuery (see https://github.com/cfxmarkets/ts-dsl-queries.git for ` +
        `for more information). Original query: '${orig}'`
    );
  }

  // Full query validations
  let o: Array<ObstructionInterface> = [];
  o = o.concat(validateDslQueryOperator(q.o, ["and", "or"]));
  o = o.concat(validateDslQueryValue(q.v, querySpec));

  // If we found obstructions, throw them
  if (o.length > 0) {
    let msg = "Sorry, the query you've passed is not valid:\n\n";
    for (let obstruction of o) {
      msg += `* ${obstruction.text} (${obstruction.code})\n`;
    }
    throw new Error(msg);
  }

  return q;
};

export const dslQueryToString = function(
  q: DslQuery,
  translator: TranslatorFunction | null = null,
  parens: boolean = false
): [string, Array<Value>] {
  if (translator === null) {
    translator = defaultTranslatorFunction;
  }

  const parts: Array<string> = [];
  const params: Array<Value> = [];
  for (let el of q.v) {
    const result: [string, Array<Value>] = isQueryLeaf(el)
      ? translator(el)
      : dslQueryToString(q, translator, true);

    parts.push(result[0]);
    params.concat(result[1]);
  }

  let queryString = parts.join(` ${q.o} `);
  if (parens) {
    queryString = `(${queryString})`;
  }

  return [queryString, params];
};
