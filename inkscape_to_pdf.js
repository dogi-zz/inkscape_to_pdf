const {parseString, Builder} = require("xml2js")
const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const {exec} = require("child_process");

const printHelpAndExit = () => {
  console.info("usage:")
  console.info(`   node ${path.basename(process.argv[1])} [svgFile] (--prefix [prefix])`);
  process.exit(0)
}

// ==============================================================0
// Process Command line Args
// ==============================================================0

const args = process.argv.slice(2);
if (args.length < 1) {
  printHelpAndExit();
}

const pureArgs = [];
const argOptions = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    argOptions[args[i].substring(2)] = args[i + 1];
    i++;
  } else {
    pureArgs.push(args[i])
  }
}
if (!pureArgs.length) {
  console.error("No SVG file given")
  printHelpAndExit();
}



const svgFile = pureArgs[0];
const pagePrefix = argOptions.prefix || 'page_';

// ==============================================================0
// Calculate Vars
// ==============================================================0

const svgBaseName = path.basename(svgFile);
const prefix = svgBaseName.substring(0, svgBaseName.length - '.svg'.length);

const tempDir = '/tmp';
const tempFile = path.resolve(tempDir, `${prefix}.tmp.svg`);

const outFile = path.resolve(path.dirname(svgFile), `${prefix}.pdf`);


const asArray = (obj) => obj === undefined ? [] : Array.isArray(obj) ? obj : [obj];

// ==============================================================0
// Help Functions
// ==============================================================0

const execute = (command) => new Promise((res, rej) => {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      rej(error);
      return;
    }
    if (stderr && stderr.length) {
      console.error(stderr);
    }
    if (stdout && stdout.length) {
      console.info(stdout)
    }
    res();
  });
});

checkGroup = (_parent, allPages) => {
  asArray(_parent.g).forEach(_group => {
    if (_group.$.id && _group.$.id.startsWith(pagePrefix)) {
      console.info(`Found Page: ${_group.$.id}`)
      allPages.push(_group.$.id)
    } else {
      checkGroup(_group, allPages);
    }
  })
}

extractPage = (_parent, page) => {
  asArray(_parent.g).forEach(_group => {
    if (_group.$.id && _group.$.id.startsWith(pagePrefix)) {
      if (_group.$.id === page) {
        _group.$.transform = undefined;
      } else {
        _parent.g = asArray(_parent.g).filter(g => g !== _group);
      }
    } else {
      extractPage(_group, page);
    }
  })
}

// ==============================================================0
// PROGRAM
// ==============================================================0

const svgFileContent = fs.readFileSync(svgFile, 'utf-8');
parseString(svgFileContent, {trim: true}, async (err, result) => {
  const allPages = [];

  // Fetch all pages ----------------------------------------------
  asArray(result.svg.g).forEach(_layer => {
    if (_layer.$['inkscape:groupmode'] === 'layer') {
      console.info(`Found Layer: ${_layer.$['inkscape:label']}`)
      checkGroup(_layer, allPages)
    }
  })
  allPages.sort((a, b) => a.localeCompare(b))

  // Perform Pages ----------------------------------------------

  const allPdfs = [];
  for (const page of allPages) {

    const tempResult = _.cloneDeep(result);
    asArray(tempResult.svg.g).forEach(_layer => {
      if (_layer.$['inkscape:groupmode'] === 'layer') {
        extractPage(_layer, page)
      }
    })

    const builder = new Builder({renderOpts: {pretty: false}});
    const xml = builder.buildObject(tempResult);
    fs.writeFileSync(tempFile, xml, 'utf-8')

    const pdfFile = path.resolve(tempDir, `${prefix}.${page}.pdf`)
    await execute(`inkscape ${tempFile} --export-pdf=${pdfFile}`).then(output => {
      allPdfs.push(pdfFile);
    });
  }

  // Merge result  ----------------------------------------------

  await execute(`pdfunite ${allPdfs.join(' ')} ${outFile}`)
  await execute(`rm ${[tempFile, ...allPdfs].join(' ')}`)

  console.info("export done!")
})
