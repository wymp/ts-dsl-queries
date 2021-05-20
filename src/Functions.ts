import {
  FieldName,
  ComparisonOperator,
  Value,
  FilterLeaf,
  FilterNode,
  FilterData,
  DomainSpec,
  TranslatorFunction,
  FieldMap,
} from "./Types";
import * as errors from "./Errors";

const isArray = function<T>(a: any): a is Array<T> {
  return Array.isArray(a);
};

interface GenericParamSet {
  [param: string]: unknown;
}

export const isFilterLeaf = function(q: any): q is FilterLeaf {
  return (
    isArray(q) &&
    q.length === 3 &&
    typeof q[0] === "string" &&
    typeof q[1] === "string" &&
    (typeof q[2] === "string" ||
      typeof q[2] === "number" ||
      typeof q[2] === "boolean" ||
      q[2] === null ||
      isArray(q[2]))
  );
};

export const isFilterNode = function(q: any, lite: boolean = false): q is FilterNode {
  return isArray(q) && (q.length === 0 || isFilterLeaf(q[0]) || isFilterData(q[0], lite));
};

export const isFilterData = function(q: any, lite: boolean = false): q is FilterData {
  if (lite) {
    return typeof q === "object" && q.hasOwnProperty("v");
  } else {
    return typeof q === "object" && q.hasOwnProperty("v") && isFilterNode(q["v"], lite);
  }
};

export const isDomainSpec = function(spec: any): spec is DomainSpec {
  if (typeof spec !== "object") {
    throw new errors.BadDomainSpec(
      `Invalid DomainSpec: DomainSpec must be an object.`,
      "ObjectRequired"
    );
  }

  const invalidKeys: Array<string> = [];
  Object.keys(spec).forEach(k => {
    if (["fieldSpecs", "defaultComparisonOperators"].indexOf(k) === -1) {
      invalidKeys.push(k);
    }
  });

  if (invalidKeys.length > 0) {
    throw new errors.BadDomainSpec(
      `Invalid DomainSpec: Invalid keys found: '${invalidKeys.join("', '")}'`,
      "InvalidKeys"
    );
  }

  if (!spec.hasOwnProperty("defaultComparisonOperators")) {
    throw new errors.BadDomainSpec(
      "Invalid DomainSpec: Missing 'defaultComparisonOperators' array",
      "MissingComparisonOperators"
    );
  }

  if (!isArray(spec.defaultComparisonOperators)) {
    throw new errors.BadDomainSpec(
      "Invalid DomainSpec: 'defaultComparisonOperators' must be an array.",
      "ComparisonOperatorsNotArray"
    );
  }

  if (
    (spec.hasOwnProperty("fieldSpecs") && typeof spec.fieldSpecs !== "object") ||
    isArray(spec.fieldSpecs)
  ) {
    throw new errors.BadDomainSpec(
      "Invalid DomainSpec: 'fieldSpecs' must be a map of field names to arrays of acceptable " +
        "comparison operators for the given field.",
      "MalformedFieldSpecs"
    );
  }

  return true;
};

export const validateDslQueryOperator = function(
  operator: string,
  validOperators: Array<string>
): Array<errors.ObstructionInterface<GenericParamSet>> {
  if (["and", "or"].indexOf(operator) === -1) {
    return [
      {
        code: "DslQueryInvalidOperator",
        text: `You may only use 'and' or 'or' as the operator in a DslQuery. You passed '${operator}'`,
      },
    ];
  } else {
    return [];
  }
};

export const validateDslQueryValue = function(
  val: FilterNode,
  domainSpec: DomainSpec
): Array<errors.ObstructionInterface<GenericParamSet>> {
  let o: Array<errors.ObstructionInterface<GenericParamSet>> = [];

  if (val.length === 0) {
    return o;
  }

  for (let next of val) {
    // If it's a full query, recurse
    if (isDslQueryData(next, true)) {
      o = o.concat(validateDslQueryValue(next.v, domainSpec));
    } else {
      let checkOperator: boolean = true;
      let operatorSet: Array<string> = domainSpec.defaultComparisonOperators;

      // Otherwise, if we've provided field specs, enforce them
      if (domainSpec.fieldSpecs) {
        // If the given field is not in the field specs, it's invalid
        if (!domainSpec.fieldSpecs.hasOwnProperty(next[0])) {
          o.push({
            code: "InvalidDslQueryField",
            text:
              `'${next[0]}' is not a valid field for this DslQuery. Valid fields are ` +
              `'${domainSpec.fieldSpecs.keys.join("', '")}'`,
          });
          checkOperator = false;
        } else {
          if (domainSpec.fieldSpecs[next[0]].length > 0) {
            operatorSet = domainSpec.fieldSpecs[next[0]];
          }
        }
      }

      // If we're checking the operator, check it
      if (
        checkOperator &&
        operatorSet.map(v => v.toLowerCase()).indexOf(next[1].toLowerCase()) === -1
      ) {
        o.push({
          code: "InvalidDslQueryComparisonOperator",
          text:
            `'${next[1]}' is not a valid operator for the '${next[0]}' field of this ` +
            `DslQuery. Valid operators are '${operatorSet.join("', '")}'`,
        });
      }

      // Finally, brief check on the value

      const getValueObstructions = function(
        field: string,
        val: any,
        valIndex?: number
      ): Array<errors.ObstructionInterface<GenericParamSet>> {
        if (val !== null && ["string", "number", "boolean"].indexOf(typeof val) === -1) {
          const index = valIndex ? ` (argument #${valIndex + 1})` : "";
          return [
            {
              code: "InvalidDslQueryValue",
              text:
                `Field '${field}'${index}: You've passed an invalid value. Valid values must ` +
                `be null, string, number, or boolean. You passed '${JSON.stringify(val)}'.`,
            },
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
            text: `Field '${next[0]}': You've supplied an array of values, but it was empty.`,
          });

          // Otherwise....
        } else {
          // Make sure the operator supports arrays
          if (["in", "not in", "between"].indexOf(next[1]) === -1) {
            o.push({
              code: "InvalidDslQueryValue",
              text:
                `Field '${next[0]}': You've supplied an array of values, but used ` +
                `a comparison operator other than 'in', 'not in' or 'between' (you used ` +
                `'${next[1]}'). Arrays of values may only be used with operators 'in' or 'not in'`,
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

// TODO: Change DslQueryData to FilterData
export function applyFieldMap(f: DslQueryData, map: FieldMap): DslQueryData {
  // Initialize new filter
  const newFilter: Partial<DslQueryData> = {
    o: f.o,
    v: [],
  };

  // For each QueryNode, sweep through and copy/translate
  for (const v of f.v) {
    if (isQueryLeaf(v)) {
      newFilter.v!.push([map[v[0]] || v[0], v[1], v[2]]);
    } else {
      newFilter.v!.push(applyFieldMap(v, map));
    }
  }

  return <DslQueryData>newFilter;
}

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
  "not in",
  "between",
  "is",
  "is not",
];

export const toSqlQuery = function(
  leaf: FilterLeaf,
  fieldDelimiter: string = "`"
): [string, Array<Value>] {
  let queryString: string = `${fieldDelimiter}${leaf[0]}${fieldDelimiter} ${leaf[1]}`;
  const params: Array<Value> = [];

  // If it's an array...
  const val = leaf[2];
  if (isArray<Value>(val)) {
    // and if the comparison operator is 'between', it's an 'and'-separated tuple
    if (leaf[1] === "between") {
      queryString += " ? and ?";
      params.push(val[0]);
      params.push(val[1]);
    } else {
      // Otherwise, the next part is a parenthesitized list of placeholders
      const placeholders: "?"[] = [];
      for (let v of val) {
        placeholders.push("?");
        params.push(v);
      }
      queryString += " (" + placeholders.join(", ") + ")";
    }
  } else {
    // Otherwise, the next part is just a single placeholder
    queryString += " ?";
    params.push(val);
  }

  return [queryString, params];
};

export const defaultTranslatorFunction = function(
  leaf: FilterLeaf,
  fieldDelimiter: string = "`"
): [string, Array<Value>] {
  return toSqlQuery(leaf, fieldDelimiter);
};

export function parseFilter(q: null | undefined | "", domainSpec?: Partial<DomainSpec>): null;
export function parseFilter(q: any, domainSpec?: Partial<DomainSpec>): FilterData;
export function parseFilter(q: any, domainSpec: Partial<DomainSpec> = {}): FilterData | null {
  if (q === null || typeof q === "undefined" || (typeof q === "string" && q.trim() === "")) {
    return null;
  }

  // Validate Query Spec
  if (!domainSpec.hasOwnProperty("defaultComparisonOperators")) {
    (domainSpec as any).defaultComparisonOperators = dslQueryDefaultComparisonOperators;
  }
  if (!isDomainSpec(domainSpec)) {
    // NOTE: because isDomainSpec throws errors, this will never execute (but that's alright)
    throw new errors.BadDomainSpec("Invalid DomainSpec");
  }

  // Capture original query for error reporting
  const orig = typeof q === "string" ? q : JSON.stringify(q);

  // Parse into object, if necessary
  if (typeof q === "string") {
    try {
      q = JSON.parse(q.trim());
    } catch (e) {
      throw new errors.BadQuery(
        `The query you've passed does not appear to be valid JSON: ${e.message}. Original ` +
          `query:\n\n${orig}`,
        "InvalidJson"
      );
    }
  }

  // Initial query validations
  if (typeof q !== "object" || q === null) {
    throw new errors.BadQuery(
      "The query you've passed does not appear to be valid. It should have parsed to a valid " +
        `JSON object or array, but didn't. Original query: '${orig}'`,
      "NonObject"
    );
  }

  // Normalize Query
  if (isFilterLeaf(q)) {
    q = {
      o: "and",
      v: [q],
    };
  } else if (isFilterNode(q)) {
    q = {
      o: "and",
      v: q,
    };
  } else if (isFilterData(q)) {
    if (!q.o) {
      q.o = "and";
    }
    q.o = <"and" | "or">q.o.toLowerCase();
  } else {
    throw new errors.BadQuery(
      "The query you've passed does not appear to be valid. It should either be a DslFilterLeaf, " +
        `a DslFilterNode, or a DslQuery (see https://github.com/OpenFinanceIO/ts-dsl-queries.git ` +
        `for more information). Original query: '${orig}'`,
      "MalformedInputObject"
    );
  }

  // Full query validations
  let o: Array<errors.ObstructionInterface<GenericParamSet>> = [];
  o = o.concat(validateDslQueryOperator(q.o, ["and", "or"]));
  o = o.concat(validateDslQueryValue(q.v, domainSpec));

  // If we found obstructions, throw them
  if (o.length > 0) {
    let msg = "Sorry, the query you've passed is not valid:\n\n";
    for (let obstruction of o) {
      msg += `* ${obstruction.text} (${obstruction.code})\n`;
    }
    const e = new errors.BadQuery(msg, "Obstructions");
    e.obstructions = o;
    throw e;
  }

  return q;
}

export const filterToString = function(
  filter: FilterData,
  translator: TranslatorFunction | null = null,
  parens: boolean = false
): [ string, Array<Value> ] {
  if (translator === null) {
    translator = defaultTranslatorFunction;
  }

  const parts: Array<string> = [];
  let params: Array<Value> = [];
  for (let i = 0; i < filter.v.length; i++) {
    const el = filter.v[i];
    const result: [string, Array<Value>] = isFilterLeaf(el)
      ? translator(el)
      : dslQueryToString(el, translator, true);

    parts.push(result[0]);
    params = params.concat(result[1]);
  }

  let queryString = parts.join(` ${filter.o} `);
  if (parens) {
    queryString = `(${queryString})`;
  }

  return [queryString, params];
}












////////////////////////////////////////
// PICK BACK UP HERE
// ////////////////////////////////////














export const dslQueryToString = function(
  q: DslQueryData,
  translator: TranslatorFunction | null = null,
  parens: boolean = false
): [string, Array<Value>] {
  let filter = filterToString(
  let queryString = 
  const parts: Array<string> = [];
  let params: Array<Value> = [];
  for (let i = 0; i < q.v.length; i++) {
    const el = q.v[i];
    const result: [string, Array<Value>] = isFilterLeaf(el)
      ? translator(el)
      : dslQueryToString(el, translator, true);

    parts.push(result[0]);
    params = params.concat(result[1]);
  }

  let queryString = parts.join(` ${q.o} `);
  if (parens) {
    queryString = `(${queryString})`;
  }

  return [queryString, params];
};
