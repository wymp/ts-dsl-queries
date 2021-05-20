import {
  Value,
  DomainSpec,
  DslQueryBuilder,
  DslQueryData,
  FilterData,
  FilterLeaf,
  FilterNode,
  TranslatorFunction,
  FieldMap,
} from "./Types";
import {
  parseFilter,
  dslQueryToString,
  toSqlQuery,
  isDslQueryData,
  applyFieldMap,
  isFilterLeaf,
} from "./Functions";

const isDslQuery = function(q: any): q is DslQuery {
  return typeof q === "object" && typeof q.value !== "undefined";
};

export class DslQuery implements DslQueryBuilder {
  private _value: DslQueryData | null = null;
  public static translator: TranslatorFunction = toSqlQuery;

  public constructor(q?: any, querySpec: Partial<DomainSpec> = {}, sort?: string) {
    this._value = parseFilter(q, querySpec);
  }

  public get value(): DslQueryData | null {
    return this._value;
  }

  public has(key: string): boolean {
    if (this._value === null) {
      return false;
    }

    const has = function(k: string, node: FilterNode): boolean {
      for (let v of node) {
        if (isFilterLeaf(v)) {
          if (v[0] === k) {
            return true;
          }
        } else {
          if (has(k, v.v)) {
            return true;
          }
        }
      }
      return false;
    };

    return has(key, this._value.v);
  }

  public get(key: string): Array<FilterLeaf> | null {
    if (this._value === null) {
      return null;
    }

    const get = function(k: string, node: FilterNode): Array<FilterLeaf> | null {
      let values: Array<FilterLeaf> = [];
      for (let v of node) {
        if (isFilterLeaf(v)) {
          if (v[0] === k) {
            values.push(v);
          }
        } else {
          const newValues = get(k, v.v);
          if (newValues) {
            values = values.concat(newValues);
          }
        }
      }
      return values.length === 0 ? null : values;
    };

    return get(key, this._value.v);
  }

  public toString(): [string, Array<Value>] {
    if (this._value) {
      return dslQueryToString(this._value, DslQuery.translator);
    } else {
      return ["", []];
    }
  }

  public and(q: DslQuery | DslQueryData | FilterNode | FilterLeaf): DslQuery {
    return this.modifyQuery(q, "and");
  }

  public or(q: DslQuery | DslQueryData | FilterNode | FilterLeaf): DslQuery {
    return this.modifyQuery(q, "or");
  }

  public mapFields(map: FieldMap): DslQuery {
    let v: DslQueryData = this._value ? deepMerge({}, this._value) : { v: [] };

    // If there's no query data, then no sense in cloning
    if (v === null) {
      return this;
    }

    // Otherwise, return a fresh query
    const newQuery = new DslQuery();
    newQuery._value = applyFieldMap(v, map);
    return newQuery;
  }

  protected modifyQuery(
    q: DslQuery | DslQueryData | FilterNode | FilterLeaf,
    operator: "and" | "or"
  ): DslQuery {
    let v: DslQueryData = this._value ? deepMerge({}, this._value) : { v: [] };

    // Convert DslQueries, leaves, and nodes to DslQueryData
    if (isDslQuery(q)) {
      q = q.value!;
    } else if (isFilterLeaf(q)) {
      q = { o: "and", v: [q] };
    } else if (!isDslQueryData(q, true)) {
      q = { o: "and", v: q };
    }

    // Clean of external references and cast
    q = <DslQueryData>deepMerge({}, q);

    const opposite = (o: "and" | "or") => {
      return { or: "and", and: "or" }[o];
    };

    // Default to "and", just in case
    if (!v.o) {
      v.o = "and";
    }

    // Switch top-level operators, if necessary, then add the clause
    if (v.o === opposite(operator)) {
      v = { o: operator, v: [v] };
    }
    v.v.push(q);

    const newQuery = new DslQuery();
    newQuery._value = v;
    return newQuery;
  }

  sort(val: string): DslQuery;
  page(type: PaginationType.cursor, val: string, size?: number): DslQuery;
  page(type: PaginationType.number, val: number, size?: number): DslQuery;
}

/**
 * Not worth adding another dependency, so we're doing deep merge ourselves here
 */
const deepMerge = function(base: any, add: any): any {
  if (typeof add === "undefined") {
    return base;
  } else if (add === null) {
    return add;
  } else if (typeof add === "object") {
    if (typeof base !== "object" || base === null || typeof base === "undefined") {
      if (typeof add.length !== "undefined") {
        return add.map((v: any) => v);
      } else {
        return Object.assign({}, add);
      }
    } else {
      if (typeof add.length !== "undefined") {
        if (typeof base.length !== "undefined") {
          return base.concat(add);
        } else {
          return add;
        }
      } else {
        for (let x in add) {
          base[x] = deepMerge(base[x], add[x]);
        }
        return base;
      }
    }
  } else {
    return add;
  }
};
