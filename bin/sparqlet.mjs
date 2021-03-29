#!/usr/bin/env node
import fs from 'fs';
import * as commonmark from 'commonmark';
import program from 'commander';
import parse5 from 'parse5';
import xmlserializer from 'xmlserializer';
import { sync } from 'slimdom-sax-parser';
import fontoxpath from 'fontoxpath';
const {
  evaluateXPathToFirstNode,
  evaluateXPathToNodes,
  evaluateXPathToString,
  registerCustomXPathFunction
} = fontoxpath;

registerCustomXPathFunction('x:matches', ['xs:string', 'xs:string'], 'xs:boolean', (ctx, input, pattern) => {
  return new RegExp(pattern).test(input);
});

program
  .arguments('<ARG>')
  .parse(process.argv);

if (program.args.length == 0) {
  program.help();
}

const parser = new commonmark.Parser();
const renderer = new commonmark.HtmlRenderer();

const md = fs.readFileSync(program.args[0], 'utf8').toString();
const html = renderer.render(parser.parse(md));
parseHtml(html);

function parseHtml(html) {
  const xhtml = xmlserializer.serializeToString(parse5.parse(html));
  const doc   = sync(xhtml);

  const title = evaluateXPathToString('//h1[1]/text()', doc);
  const params = extractParams(doc);
  const procedures = extractProcedures(doc);

  console.log(title);
  console.log(params);
  console.log(procedures);
}

function extractParams(doc) {
  const list = evaluateXPathToFirstNode('//ul[preceding-sibling::*[x:matches(name(), "^h[1-6]$")][lower-case(text()) = "parameters"]][1]', doc);

  if (!list) { return []; }

  return evaluateXPathToNodes('./li[code]', list).map((li) => {
    return {
      name:        evaluateXPathToString('./code/text()', li).trim(),
      description: evaluateXPathToString('./text()', li).trim(),
      default:     evaluateXPathToString('.//li[starts-with(., "default:")][1]', li).trim().replace(/^default:\s*/, ''),
      example:     evaluateXPathToString('.//li[starts-with(., "example:")][1]', li).trim().replace(/^example:\s*/, '')
    };
  });
}

function extractProcedures(doc) {
  return evaluateXPathToNodes('//pre/code[@class = ("language-js", "language-javascript", "language-sparql")]', doc).map((block) => {
    const heading = evaluateXPathToFirstNode('../preceding-sibling::*[x:matches(name(), "^h[1-6]$")][1]', block);
    const type    = convertClassNameToProcedureType(block.getAttribute('class'));

    return {
      bindingName: heading ? evaluateXPathToString('./code/text()', heading).trim() : '',
      name:        heading ? evaluateXPathToString('./text()', heading).trim() : '',
      data:        evaluateXPathToString('./text()', block).trim(),
      type,
      endpoint:    type === 'sparql' ? evaluateXPathToString('../preceding-sibling::p[preceding-sibling::*[1][x:matches(name(), "^h[1-6]$")][lower-case(text()) = "endpoint"]][1]/text()', block) : undefined
    };
  });
}

function convertClassNameToProcedureType(className) {
  switch (className.replace(/^language-/, '')) {
    case 'js':
    case 'javascript':
      return 'javascript';
    case 'sparql':
      return 'sparql';
    default:
      return null;
  }
}
