import * as errors from "@wymp/http-errors";

export { ObstructionInterface } from "@wymp/http-errors";

export class BadDomainSpec extends errors.InternalServerError {
  public readonly name: string = "BadDomainSpec";
  public constructor(msg: string, subcode?: string) {
    super(msg, subcode);
    this.code = "HTTP_BAD_QUERY_SPEC";
  }
}

export class BadFilter extends errors.BadRequest {
  public readonly name: string = "BadFilter";
  public constructor(msg: string, subcode?: string) {
    super(msg, subcode);
    this.code = "HTTP_BAD_FILTER";
  }
}

export class BadSort extends errors.BadRequest {
  public readonly name: string = "BadSort";
  public constructor(msg: string, subcode?: string) {
    super(msg, subcode);
    this.code = "HTTP_BAD_SORT";
  }
}

export class BadPagination extends errors.BadRequest {
  public readonly name: string = "BadPagination";
  public constructor(msg: string, subcode?: string) {
    super(msg, subcode);
    this.code = "HTTP_BAD_PAGINATION";
  }
}
