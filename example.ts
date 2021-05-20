// Parsing an incoming query

// Pretend this is an express request
const req: any = {};

const filter = FilterData.parse(req.query.filter);
const pagination = PaginationData.parse(req.query.page);
const sort = SortData.parse(req.query.sort);

// This is the spec for this particular data query
const spec: Partial<ObjectSpec> = {
  fields: {
    id: [["=","in"], ["le","id"]],
    name: [["=","!=","like","in"], ["le","displayName"]],
    email: [["=","in"]],
  },
}

const q = new DataQuery(filter, pagination, sort);
const obstructions = DataQueryValidator::validate(q, spec);
const r = new MysqlStringifier(q.value);
r.setCommand("SELECT * FROM `some-table`");
r.setGrouping(["name"]);

const parts = [
  r.command,
  r.where,
  r.grouping,
  r.having,
  r.sort,
  r.limit,
];
const query = parts.filter((v) => v !== "").join(" ");

const res = db.query(
