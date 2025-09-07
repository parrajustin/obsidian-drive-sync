/* eslint-disable @typescript-eslint/no-explicit-any */

import { z } from "zod";
import { WrapOptional } from "../lib/option";
import { Err, Ok } from "../lib/result";
import type { Result } from "../lib/result";
import { ErrorCode, InvalidArgumentError, NotFoundError, StatusError } from "../lib/status_error";
import { setAttributeOnActiveSpan } from "../logging/tracing/set-attributes-on-active-span";
import { Span } from "../logging/tracing/span.decorator";

export type VersionedSchema<UnderlyingSchema, Version> = UnderlyingSchema extends {
    version: number;
}
    ? UnderlyingSchema
    : UnderlyingSchema & { version: Version };

type ConverterFunc<
    Prev extends VersionedSchema<any, any>,
    Curr extends VersionedSchema<any, any>
> = (data: Prev) => Result<Curr, StatusError>;

type IncDigit = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
type Digit = IncDigit[number];

type Inc<T extends string> = T extends `${infer F}${Digit}`
    ? T extends `${F}${infer L extends Digit}`
        ? `${L extends 9 ? Inc<F> : F}${IncDigit[L]}`
        : never
    : 1;

type Increment<T extends number> = number extends T
    ? number
    : `${T}` extends `${string}${"." | "+" | "-" | "e"}${string}`
      ? number
      : Inc<`${T}`> extends `${infer N extends number}`
        ? N
        : never;

type GetConverters<
    Schemas extends any[],
    Prev extends ConverterFunc<any, any>[] = [],
    Index extends number = 0
> = Schemas extends []
    ? never
    : Schemas extends [unknown]
      ? Prev
      : Schemas extends [infer P, infer N, ...infer Tail]
        ? GetConverters<
              [N, ...Tail],
              [
                  ...Prev,
                  ConverterFunc<VersionedSchema<P, Index>, VersionedSchema<N, Increment<Index>>>
              ],
              Increment<Index>
          >
        : never;

type AnyValueInTuple<T extends readonly unknown[]> = T[number];

export class SchemaManager<Schemas extends VersionedSchema<any, any>[], MaxVersion extends number> {
    constructor(
        private _name: string,
        private _zodSchemas: readonly z.ZodTypeAny[],
        private _converters: GetConverters<Schemas>,
        private _default?: () => Schemas[0]
    ) {}

    /**
     * Updates the schema of the input data to the lastest version.
     * @param data the schema to validate and update
     * @returns the latest schema version data
     */
    @Span()
    public updateSchema<T extends VersionedSchema<unknown, unknown>>(
        data: T | null | undefined
    ): Result<Schemas[MaxVersion], StatusError> {
        const dataOpt = WrapOptional<VersionedSchema<unknown, unknown>>(data);
        if (dataOpt.none) {
            return Err(InvalidArgumentError("Input data either null | undefined."));
        }
        const versionOpt = WrapOptional<number>(dataOpt.safeValue().version as number);
        if (versionOpt.none) {
            return Err(InvalidArgumentError("Couldn't get input data version."));
        }
        if (versionOpt.safeValue() < 0 || versionOpt.safeValue() > this._converters.length) {
            return Err(
                InvalidArgumentError(
                    `Failed to get a valid verison number found "${versionOpt.safeValue()}" expected (0, ${this._converters.length}).`
                )
            );
        }
        return this.loadDataInternal(data, versionOpt.safeValue());
    }

    /**
     * Gets the default configuration of the schema.
     * @returns latest schema version
     */
    @Span()
    public getDefault(): Result<Schemas[MaxVersion], StatusError> {
        const defaultFunc = WrapOptional(this._default);
        if (defaultFunc.none) {
            return Err(NotFoundError(`No default schema found for ${this._name}.`));
        }
        return this.loadDataInternal(defaultFunc.safeValue()(), 0);
    }

    @Span()
    private loadDataInternal(
        data: AnyValueInTuple<Schemas>,
        version: number
    ): Result<Schemas[MaxVersion], StatusError> {
        setAttributeOnActiveSpan(`version`, version);

        const zodSchema = this._zodSchemas[version];
        if (!zodSchema) {
            return Err(
                new StatusError(ErrorCode.INTERNAL, `No zod schema found for version ${version}`)
            );
        }

        const parseResult = zodSchema.safeParse(data);
        if (parseResult.error) {
            return Err(
                new StatusError(
                    ErrorCode.INVALID_ARGUMENT,
                    `Schema validation failed for ${this._name} version ${version}: ${parseResult.error.toString()}`
                )
            );
        }

        if (version >= this._converters.length) {
            return Ok(parseResult.data);
        }
        const converter = this._converters[version] as unknown as ConverterFunc<any, any>;
        const newData = converter(data) as Result<AnyValueInTuple<Schemas>, StatusError>;
        if (newData.err) {
            return newData;
        }
        return this.loadDataInternal(newData.safeUnwrap(), version + 1);
    }

    public getLatestVersion(): number {
        return this._converters.length;
    }
}
