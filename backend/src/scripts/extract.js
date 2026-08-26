const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:/Users/AVACADOO/.gemini/antigravity-ide/brain/7406cd37-1a5d-4dcd-9208-a9c59cd5a447/.system_generated/logs/transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const data = JSON.parse(line);
    if (data.type === 'USER_INPUT') {
      console.log(data.content);
      break;
    }
  }
}

processLineByLine();
