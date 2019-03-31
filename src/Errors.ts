import * as errors from "@openfinance/http-errors";

export { ObstructionInterface } from "@openfinance/http-errors";

export class BadQuerySpec extends errors.InternalServerError {
  public readonly name: string = "BadQuerySpec";
  public constructor(msg: string, subcode?: string) {
    super(msg, subcode);
    this.code = "HTTP_BAD_QUERY_SPEC";
  }
}

export class BadQuery extends errors.BadRequest {
  public readonly name: string = "BadQuery";
  public constructor(msg: string, subcode?: string) {
    super(msg, subcode);
    this.code = "HTTP_BAD_QUERY";
  }
}
