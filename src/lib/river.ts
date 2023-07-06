import Parser from "web-tree-sitter";
import { BlockType, ArgumentType } from "./components";

export function encodeValue(v: any): string {
  switch (typeof v) {
    case "string":
    case "boolean":
    case "number":
      return JSON.stringify(v);
    case "object":
      if (Array.isArray(v)) {
        let out = "[\n";
        v.forEach((e) => {
          out += "  " + encodeValue(e).replaceAll("\n", "\n  ");
          out += ",\n";
        });
        return out + "]";
      }
      if (v["-reference"]) {
        return v["-reference"];
      }
      let out = "{\n";
      for (const k in v) {
        out += `  "${k}" = ${encodeValue(v[k])},\n`;
      }
      return out + "}";
    default:
      return `${v}`;
  }
}

export class Block {
  name: string;
  label: string | null;
  attributes: Argument[];
  constructor(
    name: string,
    label: string | null = null,
    attributes: Argument[] = []
  ) {
    this.name = name;
    this.label = label;
    this.attributes = attributes;
  }
  marshal(): string {
    let out = `${this.name} `;
    if (this.label) {
      out += `"${this.label}" `;
    }
    out += "{\n";
    this.attributes.forEach((a) => {
      out += "  " + a.marshal().replaceAll("\n", "\n  ") + "\n";
    });
    out += "}";
    return out;
  }
  formValues(spec?: BlockType): Record<string, any> {
    let values: Record<string, any> = {};
    for (const argName of spec ? Object.keys(spec.args) : []) {
      values[argName] = spec!.args[argName].default();
    }
    this.attributes.forEach((a) => {
      if (a instanceof Attribute) {
        values[`${a.name}`] = a.value;
      } else {
        const fv = a.formValues();
        if (spec?.args[a.name]?.multiple()) {
          values[a.name] = values[a.name] ? [...values[a.name], fv] : [fv];
        } else {
          values[a.name] = fv;
        }
      }
    });
    return values;
  }
}

export class Attribute {
  name: string;
  value: any;
  constructor(name: string, value: any) {
    this.name = name;
    this.value = value;
  }
  marshal(): string {
    return `${this.name} = ${encodeValue(this.value)}`;
  }
  formValues(): Record<string, any> {
    let v: Record<string, any> = {};
    v[this.name] = this.value;
    return v;
  }
}

interface Argument {
  name: string;
  marshal(): string;
  formValues(spec?: BlockType): Record<string, any>;
}

export function UnmarshalArray(n: Parser.SyntaxNode): any[] {
  let array = [];
  for (const entryNode of n.namedChildren) {
    array.push(UnmarshalValue(entryNode));
  }
  return array;
}

export function UnmarshalValue(node: Parser.SyntaxNode): any {
  let out: any;
  switch (node.type) {
    case "literal_value":
      out = JSON.parse(node.text);
      break;
    case "identifier":
      out = { "-reference": node.text };
      break;
    case "array":
      out = UnmarshalArray(node);
      break;
    case "object":
      out = {};
      for (const n of node.namedChildren) {
        const key = n.namedChild(0)!;
        const value = n.namedChild(1)!;
        if (key.type === "string_lit")
          out[JSON.parse(key.text)] = UnmarshalValue(value);
        else out[key.text] = UnmarshalValue(value);
      }
      break;
    default:
      out = {};
  }
  return out;
}

export function UnmarshalBlock(n: Parser.SyntaxNode): Block {
  const name = n.childForFieldName("name")!.text;
  const label = n.childForFieldName("label")?.namedChild(0)?.text;
  const argNodes = n.childForFieldName("body")?.namedChildren;
  const args: Argument[] = [];
  if (argNodes) {
    for (const arg of argNodes) {
      switch (arg.type) {
        case "attribute":
          const key = arg.childForFieldName("key")!.text;
          args.push(
            new Attribute(key, UnmarshalValue(arg.childForFieldName("value")!))
          );
          break;
        case "block":
          args.push(UnmarshalBlock(arg));
          break;
      }
    }
  }
  return new Block(name, label, args);
}

export function toArgument(
  k: string,
  v: any,
  spec?: ArgumentType
): Argument | null {
  switch (typeof v) {
    case "string":
    case "boolean":
    case "number":
      if (v === "" || v === null || Number.isNaN(v)) return null;
      if (v === spec?.default()) return null;
      return new Attribute(k, v);
    default:
      if (Array.isArray(v)) {
        return v.length === 0 ? null : new Attribute(k, v);
      }
      if (v["-reference"]) {
        return new Attribute(k, v);
      }
      return toBlock(k, v, undefined, spec as BlockType);
  }
}

export function toBlock(
  k: string,
  v: any,
  label?: string,
  spec?: BlockType
): Block | null {
  // flatmap instead of filter to avoid introducing the null type
  const args = Object.keys(v).flatMap((x) => {
    if (spec?.args[x]?.multiple()) {
      return (v[x] as Array<any>).flatMap((blockinstance) => {
        const b = toBlock(x, blockinstance);
        if (b == null) return [];
        return [b];
      });
    } else {
      const arg = toArgument(x, v[x], spec?.args[x]);
      if (arg == null) {
        return [];
      }
      return [arg];
    }
  });
  if (label) return new Block(k, label, args);
  if (args.length === 0 && !(spec as BlockType)?.allowEmpty) return null;
  return new Block(k, label, args);
}
