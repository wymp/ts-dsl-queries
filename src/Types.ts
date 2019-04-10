export type FieldName = string;
export type ComparisonOperator = string;
export type Value = string | number | boolean | null;
export type QueryLeaf = [FieldName, ComparisonOperator, Value | Array<Value>];
export type QueryNode = Array<QueryLeaf | DslQueryData>;
export interface DslQueryData {
  o: "and" | "or";
  v: QueryNode;
}
export type QuerySpec = {
  fieldSpecs?: {
    [fieldName: string]: Array<ComparisonOperator>;
  };
  defaultComparisonOperators: Array<ComparisonOperator>;
};

export type TranslatorFunction = (leaf: QueryLeaf) => [string, Array<Value>];
