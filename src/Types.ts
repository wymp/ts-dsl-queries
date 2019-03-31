export type FieldName = string;
export type ComparisonOperator = string;
export type Value = string | number | boolean | null;
export type QueryLeaf = [FieldName, ComparisonOperator, Value | Array<Value>];
export type QueryNode = Array<QueryLeaf | DslQuery>;
export interface DslQuery {
  o: "and" | "or";
  v: QueryNode;
}
export type QuerySpec = {
  fieldSpecs?: {
    [fieldName: string]: Array<ComparisonOperator>;
  };
  defaultComparisonOperators: Array<ComparisonOperator>;
};

export interface ObstructionInterface {
  code: string;
  text: string;
}

export type TranslatorFunction = (leaf: QueryLeaf) => [string, Array<Value>];
