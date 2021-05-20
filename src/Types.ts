import { DslQuery } from "./DslQuery";

// Filtering
export type FieldName = string;
export type ComparisonOperator = string;
export type Value = string | number | boolean | null;
export type FilterLeaf = [FieldName, ComparisonOperator, Value | Array<Value>];
export type FilterNode = Array<FilterLeaf | FilterData>;
export interface FilterData {
  o: "and" | "or";
  v: FilterNode;
}

// Sorting
declare type SortField = string;
declare type SortOrder = "asc"|"desc";
export type SortData = Array<[ SortField, SortOrder ]>;

/**
 * Note: Pagination is a very complicated field. This data structure is meant to accommodate
 * all pagination schemes through a deferred interpretation of the cursor parameter. For example,
 * to implement simple page number-based pagination, you would pass something like `num:6` as the
 * cursor. The implementation would then interpret this as you wish. However, you can additionally
 * implement more complex cursor-based pagination by passing, for example, `timestamp:123456789`,
 * which can then be interpreted as a cursor field/value pair.
 */
type Base64CursorValue = string;
export type PaginationData = {
  cursor?: Base64CursorValue;
  size?: number;
}

/**
 * All data comprising a full data query
 */
export interface DslQueryData {
  command: string;
  filter?: FilterData | null;
  sort?: SortData | null;
  pagination?: PaginationData | null;
}

/**
 * FieldData is either a string field name or a tuple representing a table alias and field name
 */
export type FieldData = string | [string, string];

/**
 * An object expressing the domain constraints for a given query
 *
 * These objects are used to define which fields are available for a given query and what
 * comparison operators may be used with those fields.
 */
export type ObjectSpec = {
  fields?: {
    [fieldName: string]: [Array<ComparisonOperator>, FieldData?];
  };
  defaultComparisonOperators: Array<ComparisonOperator>;
};

/**
 * An interface facilitating the simple building up of a DSL Data Query
 */
export interface DslQueryBuilder {
  and(q: DslQuery | DslQueryData | FilterData | FilterNode | FilterLeaf): DslQuery;
  or(q: DslQuery | DslQueryData | FilterData | FilterNode | FilterLeaf): DslQuery;
  sort(val: string | SortData | undefined): DslQuery;
  page(cursor: string | undefined, size?: number | undefined): DslQuery;
}

/**
 * A function that translates the data for a given query into a value that can be used
 * in other systems, such as a SQL database.
 *
 * This particular definition is somewhat tightly coupled to the common implementation for
 * SQL database clients, where you have a string with placeholders and a flat array of values that
 * are inserted into those placeholders.
 */
export type TranslatorFunction = (leaf: FilterLeaf) => [string, Array<Value>];

/**
 * An object representing a mapping of fields from public-facing property names to internal
 * datasource field references.
 *
 * For example, your public field may be parent, but internally the query may be a complex join
 * that results in a field reference like
 *
 * ```sql
 * ... WHERE `my-table`.`parentId` = ?, ...
 * ```
 *
 * In this case, you would apply a field map like, `{ parent: "my-table\`.\`parentId" }`.
 *
 * Note: This is not ideal, and will be improved in future versions.
 */
export interface FieldMap {
  [fromField: string]: string;
}
