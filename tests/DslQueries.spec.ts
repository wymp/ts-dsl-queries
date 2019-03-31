import "mocha";
import { assert } from "chai";
import { parseDslQuery, dslQueryToString, Value, QueryLeaf } from "../src/index";
import * as errors from "@openfinance/http-errors";

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
    let q = parseDslQuery(
      JSON.stringify({
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
      })
    );

    let r = dslQueryToString(q!);
    assert.equal(
      r[0],
      "`name` = ? and (`age` > ? or `status` in (?, ?, ?) or (`parent` in (?, ?) and `status` = ?))"
    );
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
