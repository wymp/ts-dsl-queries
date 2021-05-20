import { DslQuery, DslQueryData, dslQueryToString, Value } from "./";
import * as E from "@openfinance/http-errors";

export interface Stringifier {
  toString(): [ string, Array<any> ];
}

interface PaginationData {
  cursor?: string;
  size?: number;
}

type SortData = [ string, "asc" | "desc" ];

type Limit = number;
type Offset = number;
type LimitData = Limit | [ Limit, Offset ];

type TableAlias = string;
type FieldName = string;
type FieldAlias = string;
type SimpleFieldData = { f: FieldName; t?: TableAlias; a?: FieldAlias; }
type ComplexFieldData = { subquery: SqlQueryData | Query; a: FieldAlias }
type FunctionFieldData = {
  func: string;
  args: Array<null | string | number | boolean | FieldData>;
  a: FieldAlias;
};
type FieldData = SimpleFieldData | ComplexFieldData | FunctionFieldData;

type DbName = string;
type TableName = string;
type JoinType = "INNER" | "LEFT" | "RIGHT" | "OUTER";
type SimpleTableData = {
  t: TableName;
  d?: DbName;
  a?: TableAlias;
  j?: {
    t?: JoinType;
    on?: DslQueryData | null;
  };
};
type ComplexTableData = {
  subquery: SqlQueryData | Query;
  a: TableAlias;
  j?: {
    t: JoinType;
    on?: DslQueryData | null;
  };
};
type TableData = SimpleTableData | ComplexTableData;

type SqlVerb = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

interface SqlQueryData {
  verb: SqlVerb;
  fields: Array<FieldName | FieldData>;
  tables: Array<TableName | TableData>;
  where?: DslQueryData | null;
  grouping?: Array<FieldName | FieldData> | null;
  having?: DslQueryData | null;
  order?: Array<SortData> | null;
  limit?: LimitData | null;
}

function hasSubquery<T extends ComplexFieldData | SimpleFieldData>(o: any): o is T {
  return !!o.subquery;
}

export class Query {
  public constructor(private _value: SqlQueryData) {}

  public get value(): SqlQueryData {
    return this._value;
  }

  public where(v: DslQueryData): Query {
    this._value.where = v;
    return this;
  }

  public having(v: DslQueryData): Query {
    this._value.having = v;
    return this;
  }

  public sort(sort: string | SortData | Array<SortData> | null | undefined): Query {
    if (!sort) {
      if (this._value.order) {
        delete this._value.order;
      }
      return this;
    }

    this._value.order = (typeof sort !== "string")
      ? <Array<SortData>>(Array.isArray(sort[0]) ? sort : [sort])
      : sort.split(",").map((v) => {
        if (v[0].match(/[+-]/)) {
          return [ v.substr(1), v[0] === "-" ? "desc" : "asc" ];
        } else {
          return [ v, "asc" ];
        }
      });

    return this;
  }

  public limit(v: LimitData): Query {
    this._value.limit = v;
    return this;
  }

  public paginate(p: PaginationData | undefined | null): Query {
    const o: Array<E.ObstructionInterface> = [];

    // Default to 20 results if page size not given
    let limit: LimitData = (p && p.size) ? p.size : 20;

    // If we haven't passed any meaningful pagination data, just apply the limit and call it a day
    if (!p || !p.cursor) {
      return this.limit(limit);
    }

    // Otherwise, we've passed a cursor....
    // If it's a number, add it to the limit clause, set limit, and return
    if (p.cursor.match(/^num:[0-9]+$/)) {
      let pageNum = parseInt(p.cursor.substr(4));
      if (pageNum < 1) {
        pageNum = 1;
      }
      return this.limit([ limit, limit * (pageNum - 1) ]);
    }

    // Otherwise, make sure the fields in the cursor align exactly with the sort, if given, and
    // assemble the cursor data for further processing
    const sort: Array<SortData> = [];
    const cursorData: Array<[string, string, any]> = p.cursor.split(",").map((val, i) => {
      const v = val.split(":");

      // Add obstruction if the caluse is not a key/value pair
      if (v.length !== 2) {
        o.push({
          code: "Invalid Cursor Data",
          text: `Cursor data must conform to the format 'fieldname:lastSeenValue'. You ` +
          `passed '${val}' at position ${i}`,
          params: {
            cursorClause: val,
            clauseIndex: i,
          }
        });
      }

      // Add obstruction if the clause has fields that don't match the sort fields.
      if (this._value.order && !this._value.order.find((s) => s[0] === v[0])) {
        o.push({
          code: "Invalid Cursor Field",
          text: `You've passed a cursor field, '${v[0]}', that doesn't agree with the ` +
          `sort fields you've requested (${sort.map(
            (s1) => `${s1[1] === "desc" ? "-" : ""}${s1[0]}`
          ).join(",")})`,
          params: {
            cursorClause: val,
            clauseIndex: i,
            sortFields: sort.map((s1) => s1[0]),
          },
        });
      };

      // Now all is well. Add the sort clause, if not present, and add this clause to the query
      sort.push([v[0], "asc"]);
      const op = sort.find((s1) => s1[0] === v[0])![1] === "asc" ? ">" : "<";
      return [ v[0], op, v[1] ];
    });

    // If we have obstructions, throw an error
    if (o.length > 0) {
      const e = new E.BadRequest("You've passed invalid pagination data", "InvalidPagination");
      e.obstructions = o;
      throw e;
    }

    // Set sort from cursor fields, if necessary
    if (!this._value.order) {
      this.sort(sort);
    }

    // Now loop through cursor data and compose query
    let i = cursorData.length - 1;
    let cursorQuery = new DslQuery([cursorData[i][0], cursorData[i][1], cursorData[i][2]]);
    for (let j = i-1; j >= 0; j--) {
      cursorQuery = cursorQuery
        .and([ cursorData[j][0], `${cursorData[j][1]}=`, cursorData[j][2] ])
        .or([ cursorData[j][0], cursorData[j][1], cursorData[j][2] ]);
    }

    // Set having clause and return
    return this.having(cursorQuery.value!);
  }
}

export class MysqlStringifier implements Stringifier {
  protected query: SqlQueryData;
  public constructor(query: Query | SqlQueryData) {
    if (query instanceof Query) {
      this.query = query.value;
    } else {
      this.query = query;
    }
  }

  public toString(): [ string, Array<any> ] {
    const o: Array<E.ObstructionInterface> = [];
    if (this.query.verb === "INSERT") {
      throw new E.NotImplemented("INSERT queries have not yet been implemented");
    } else if (this.query.verb === "UPDATE") {
      throw new E.NotImplemented("UPDATE queries have not yet been implemented");

      // Validate
      if (this.query.tables.length > 1) {
        o.push({
          code: `Too Many Tables`,
          text: `You may only pass a single table for an update query`,
        });
      }
      if (this.query.fields.length === 0) {
        o.push({
          code: `Missing Fields`,
          text: `You must pass at least one field for an update`,
        });
      }

      if (o.length > 0) {
        const e = new E.InternalServerError("There are problems with your query");
        e.obstructions = o;
        throw e;
      }

      const where = this.whereToString();
      return [
        (`NOT YET IMPLEMENTED`),
        where ? where![1] : []
      ];
    } else if (this.query.verb === "DELETE") {
      throw new E.NotImplemented("DELETE queries have not yet been implemented");
    } else {
      const where = this.whereToString();
      const having = this.havingToString();
      const group = this.groupingToString();
      const sort = this.sortToString();
      const limit = this.limitToString();
      let params: Array<Value> = [];

      if (where) {
        params = params.concat(where[1]);
      }
      if (having) {
        params = params.concat(having[1]);
      }

      return [
        (`${this.query.verb} ` +
        `${this.fieldsToString()} ` +
        `FROM ${this.tablesToString()} ` +
        (where ? `WHERE ${where[0]} ` : "") +
        (group ? `GROUP BY ${group}` : "") +
        (having ? `HAVING ${having[0]} ` : "") +
        (sort ? `ORDER BY ${sort}` : ``) +
        (limit ? `LIMIT ${limit}` : ``)).trim().replace(/  +/g, " "),
        params
      ];
    }
  }

  public fieldsToString(): string {
    return this.query.fields.map(this.formatFieldString).join(", ");
  }

  protected formatFieldString(f: FieldName | FieldData): string {
    if (typeof f === "string") {
      return f === "*" ? f : `\`${f}\``;
    }

    if (hasSubquery<ComplexFieldData>(f)) {
      return `(${(new MysqlStringifier(f.subquery)).toString()}) AS \`${f.a}\``;
    }

    const f1 = <SimpleFieldData>f;
    return (f1.t ? `\`${f1.t}\`.` : "") +
      (f1.f === "*" ? f1.f : `\`${f1.f}\``) +
      (f1.a ? ` AS \`${f1.a}\`` : "");
  }

  public tablesToString(): string {
    let tables = this.query.tables.slice(0);
    let finished = [this.formatTableString(tables.shift()!, false)];
    if (tables.length > 0) {
      finished = finished.concat(tables.map((t) => {
        return this.formatTableString(t, true);
      }));
    }
    return finished.join(" ");
  }

  protected formatTableString(t: TableData | TableName, joins: boolean): string {
    if (typeof t === "string") {
      return `\`${t}\``;
    }

    // If it specifies a subquery do that
    if (hasSubquery<ComplexTableData>(t)) {
      const join = t.j && t.j.t ? `${t.j.t} JOIN` : `INNER JOIN`;
      const on = t.j && t.j.on ? `ON (${dslQueryToString(t.j.on)[0]})` : null;
      return `${joins ? `${join} ` : ""}(${(new MysqlStringifier(t.subquery)).toString()}) ` +
        `AS \`${t.a}\`${on ? ` ${on}` : ""}`;
    }

    // Otherwise, it's a regular table, so do that
    const tt = <SimpleTableData>t;
    const join = tt.j && tt.j.t ? `${tt.j.t} JOIN` : `INNER JOIN`;
    const on = tt.j && tt.j.on ? `ON (${dslQueryToString(tt.j.on)[0]})` : null;
    return (joins ? `${join} ` : "") +
      (tt.d ? `\`${tt.d}\`.` : "") +
      `\`${tt.t}\`` +
      (tt.a ? ` AS \`${tt.a}\`` : "") +
      (on ? ` ${on}` : "");
  }

  public whereToString(): null | [ string, Array<any> ] {
    if (!this.query.where) {
      return null;
    } else {
      return dslQueryToString(this.query.where);
    }
  }

  public groupingToString(): string | null {
    return this.query.grouping
      ? this.query.grouping.map(this.formatFieldString).join(", ")
      : null;
  }

  public havingToString(): null | [ string, Array<any> ] {
    if (!this.query.having) {
      return null;
    } else {
      return dslQueryToString(this.query.having);
    }
  }

  public sortToString(): string | null {
    return this.query.order
      ? this.query.order.map(
        (s) => `${this.formatFieldString(s[0])} ${s[1].toUpperCase()}`
      ).join(", ")
      : null;
  }

  public limitToString(): string | null {
    if (!this.query.limit) {
      return null;
    }

    return Array.isArray(this.query.limit)
      ? `${this.query.limit[0]} OFFSET ${this.query.limit[1]}`
      : `${this.query.limit}`;
  }
}

