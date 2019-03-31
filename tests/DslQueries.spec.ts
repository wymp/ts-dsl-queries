import "mocha";
import { assert } from "chai";
import { parseDslQuery, dslQueryToString } from "../src/index";
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
        "You've supplied an array of values, but used a comparison operator other than 'in' or 'not in'"
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

  it("should accept query spec with or without defaultComparisonOperators");

  it("should parse query without query spec");
});

describe("dslQueryToString", () => {});

describe("defaultTranslatorFunction", () => {});
