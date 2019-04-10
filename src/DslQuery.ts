import { QuerySpec, DslQueryData, QueryNode, TranslatorFunction } from "./Types";
import { parseDslQuery, dslQueryToString, toSqlQuery, isQueryLeaf } from "./Functions";

export class DslQuery {
  public readonly value: DslQueryData | null = null;
  public static translator: TranslatorFunction = toSqlQuery;

  public constructor(q: any, querySpec: Partial<QuerySpec> = {}) {
    this.value = parseDslQuery(q, querySpec);
  }

  public has(key: string): boolean {
    if (this.value === null) {
      return false;
    }

    const has = function(k: string, node: QueryNode): boolean {
      for (let v of node) {
        if (isQueryLeaf(v)) {
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

    return has(key, this.value.v);
  }

  public toString() {
    if (this.value) {
      return dslQueryToString(this.value, DslQuery.translator);
    } else {
      return "";
    }
  }
}
