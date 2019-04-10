import "mocha";
import { assert } from "chai";
import {
  parseDslQuery,
  dslQueryToString,
  Value,
  QueryLeaf,
  isQueryLeaf,
  DslQuery
} from "../src/index";
import * as errors from "@openfinance/http-errors";

const complexQueryData = {
  o: "and",
  v: [
    ["name", "=", "test"],
    {
      o: "or",
      v: [
        ["age", ">", 30],
        ["status", "in", ["retired", "deceased", "disabled"]],
        {
          o: "and",
          v: [["parent", "in", ["bob", "tammy"]], ["status", "=", "youthful"]]
        }
      ]
    }
  ]
};

const complexQueryString =
  "`name` = ? and (`age` > ? or `status` in (?, ?, ?) or " +
  "(`parent` in (?, ?) and `status` = ?))";

describe("parseDslQuery", () => {
  const testQuerySpec = {
    fieldSpecs: {
      name: ["=", "!=", "in"],
      email: ["=", "!="],
      description: []
    }
  };

  it("should return null for null or blank values", () => {
    assert.isNull(parseDslQuery(null, testQuerySpec));
    assert.isNull(parseDslQuery("", testQuerySpec));
    assert.isNull(parseDslQuery("     ", testQuerySpec));
    assert.isNull(parseDslQuery("   \n\n  ", testQuerySpec));
  });

  it("should validate incoming query spec", () => {
    const specs: Array<[object, string]> = [
      [{ fields: { name: ["="] } }, "Invalid keys found: 'fields'"],
      [{ fieldSpecs: [{ name: ["="] }] }, "'fieldSpecs' must be a map of field name"],
      [{ fieldSpecs: "name" }, "'fieldSpecs' must be a map of field names"],
      [
        { fieldSpecs: { name: ["="] }, defaultComparisonOperators: { name: ["="] } },
        "'defaultComparisonOperators' must be an array"
      ],
      [
        { fieldSpecs: { name: ["="] }, defaultComparisonOperators: "=|&|!=" },
        "'defaultComparisonOperators' must be an array"
      ]
    ];

    specs.forEach(spec => {
      try {
        parseDslQuery(`["name","=","Jim Chavo"]`, spec[0]);
        assert.fail("Should have failed on bad query spec: " + JSON.stringify(spec[0]));
      } catch (e) {
        if (e.name && e.name === "AssertionError") {
          throw e;
        }
        assert.isTrue(
          !!e.message.match(spec[1]),
          `Error string didn't match for object ${JSON.stringify(spec[0])}:\n\n` + e.message
        );
      }
    });
  });

  it("should properly validate incoming query", () => {
    const queries: Array<[any, string]> = [
      ["not a good query", "The query you've passed does not appear to be valid JSON"],
      ["false", "It should have parsed to a valid JSON object or array"],
      [true, "It should have parsed to a valid JSON object or array"],
      ['"some string"', "It should have parsed to a valid JSON object or array"],
      ["null", "It should have parsed to a valid JSON object or array"],
      [
        JSON.stringify({ v: ["one", "two", "three", "four"] }),
        "The query you've passed does not appear to be valid. It should either be a DslQueryLeaf,"
      ],
      [
        JSON.stringify(["one", "two", "three", "four"]),
        "The query you've passed does not appear to be valid. It should either be a DslQueryLeaf,"
      ],
      [
        JSON.stringify({ v: "not correct" }),
        "The query you've passed does not appear to be valid. It should either be a DslQueryLeaf,"
      ],
      [JSON.stringify({ v: [["myField", "is", "something"]] }), "'is' is not a valid operator"],
      [
        JSON.stringify({ v: [["myField", "=", ["something"]]] }),
        "You've supplied an array of values, but used a comparison operator other than"
      ]
    ];

    queries.forEach(query => {
      try {
        parseDslQuery(query[0]);
        assert.fail("Should have failed on bad query: " + JSON.stringify(query[0]));
      } catch (e) {
        if (e.name && e.name === "AssertionError") {
          throw e;
        }
        assert.isTrue(
          !!e.message.match(query[1]),
          `Error string didn't match for object ${JSON.stringify(query[0])}:\n\n` + e.message
        );
      }
    });
  });

  it("should accept query spec with or without defaultComparisonOperators", () => {
    let q = parseDslQuery(JSON.stringify(["name", "=", "test"]), { fieldSpecs: { name: ["="] } });
    assert.equal(<Value>(q!.v[0] as QueryLeaf)[2], "test");

    q = parseDslQuery(JSON.stringify(["name", "=", "test"]), {
      fieldSpecs: {
        name: []
      },
      defaultComparisonOperators: ["="]
    });
    assert.equal(<Value>(q!.v[0] as QueryLeaf)[2], "test");
  });

  it("should parse query without query spec", () => {
    let q = parseDslQuery(JSON.stringify(["name", "=", "test"]));
    assert.equal(<Value>(q!.v[0] as QueryLeaf)[2], "test");
  });
});

describe("dslQueryToString", () => {
  it("should stringify simple queries correctly", () => {
    let q = parseDslQuery(JSON.stringify(["name", "=", "test"]));
    let r = dslQueryToString(q!);
    assert.equal(r[0], "`name` = ?");
    assert.equal(r[1].length, 1);
    assert.equal(r[1][0], "test");

    q = parseDslQuery(
      JSON.stringify(["dob", "between", ["2000-01-01 00:00:00", "2001-01-01 00:00:00"]])
    );
    r = dslQueryToString(q!);
    assert.equal(r[0], "`dob` between ? and ?");
    assert.equal(r[1].length, 2);
    assert.equal(r[1][0], "2000-01-01 00:00:00");
    assert.equal(r[1][1], "2001-01-01 00:00:00");

    q = parseDslQuery(JSON.stringify([["name", "=", "test"], ["age", ">", 30]]));
    r = dslQueryToString(q!);
    assert.equal(r[0], "`name` = ? and `age` > ?");
    assert.equal(r[1].length, 2);
    assert.equal(r[1][0], "test");
    assert.equal(r[1][1], 30);

    q = parseDslQuery(JSON.stringify({ o: "or", v: [["name", "=", "test"], ["age", ">", 30]] }));
    r = dslQueryToString(q!);
    assert.equal(r[0], "`name` = ? or `age` > ?");
    assert.equal(r[1].length, 2);
    assert.equal(r[1][0], "test");
    assert.equal(r[1][1], 30);
  });

  it("should stringify complex queries correctly", () => {
    let q = parseDslQuery(JSON.stringify(complexQueryData));

    let r = dslQueryToString(q!);
    assert.equal(r[0], complexQueryString);
    assert.equal(r[1].length, 8);
    assert.equal(r[1][0], "test");
    assert.equal(r[1][1], 30);
    assert.equal(r[1][2], "retired");
    assert.equal(r[1][3], "deceased");
    assert.equal(r[1][4], "disabled");
    assert.equal(r[1][5], "bob");
    assert.equal(r[1][6], "tammy");
    assert.equal(r[1][7], "youthful");
  });
});

describe("DslQuery", function() {
  it("should instantiate correctly and present it's value", function() {
    let q = new DslQuery(JSON.stringify(["name", "=", "jim chavo"]));
    assert.isTrue(q.hasOwnProperty("value"));
    assert.isNotNull(q.value);

    const clause = q.value!.v[0];
    if (isQueryLeaf(clause)) {
      assert.equal(clause[0], "name");
      assert.equal(clause[1], "=");
      assert.equal(clause[2], "jim chavo");
    } else {
      assert.fail("Clause is not a query leaf!");
    }
  });

  it("should correctly determine whether or not it 'has' a clause", function() {
    let q = new DslQuery(
      JSON.stringify([
        ["name", "=", "jim chavo"],
        { v: [["email", "like", "something@something.com"]] }
      ])
    );

    assert.isTrue(q.has("name"));
    assert.isTrue(q.has("email"));
    assert.isFalse(q.has("telephone"));
  });

  it("should correctly go to string", function() {
    let q = new DslQuery(complexQueryData);
    let r = q.toString();
    assert.equal(r[0], complexQueryString);
    assert.equal(r[1].length, 8);
    assert.equal(r[1][0], "test");
    assert.equal(r[1][1], 30);
    assert.equal(r[1][2], "retired");
    assert.equal(r[1][3], "deceased");
    assert.equal(r[1][4], "disabled");
    assert.equal(r[1][5], "bob");
    assert.equal(r[1][6], "tammy");
    assert.equal(r[1][7], "youthful");
  });

  it("should correctly return arrays of query leaves on get", function() {
    let q = new DslQuery(complexQueryData);
    let values = q.get("status");
    assert.isNotNull(values);
    assert.equal(values!.length, 2);
    assert.equal(values![0][1], "in");
    assert.isTrue(Array.isArray(values![0][2]));
    assert.equal(values![1][1], "=");
    assert.equal(values![1][2], "youthful");
  });
});
