/*
SPDX-FileCopyrightText: 2024 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const fs = require('fs')
const readline = require('readline')

function replacePlaceholders(obj, replacements) {
  if (typeof obj === "object") {
    if (Array.isArray(obj)) {
      // If it's an array, recursively process each element
      for (let i = 0; i < obj.length; i++) {
        obj[i] = replacePlaceholders(obj[i], replacements)
      }
    } else {
      // If it's an object, recursively process each property
      for (const prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          obj[prop] = replacePlaceholders(obj[prop], replacements)
        }
      }
    }
  } else if (typeof obj === "string") {
    // If it's a string, replace placeholders
    Object.entries(replacements).forEach(([placeholder, value]) => {
      const regex = new RegExp("\\${" + placeholder + "}", "g")
      obj = obj.replace(regex, value)
    })
  }
  return obj
}

function mergeObj(obj1, obj2) {
  const mergedObj = { ...obj1 }

  for (const key in obj2) {
      if (obj2.hasOwnProperty(key)) {
          mergedObj[key] = obj2[key]
      }
  }
  return mergedObj
}

function isCAPOperatorChart(chartFolderPath) {
  try {
    const chartYaml = cds.parse.yaml(fs.readFileSync(chartFolderPath + "/Chart.yaml").toString())
    return chartYaml.annotations?.["app.kubernetes.io/managed-by"] === 'cap-operator-plugin' || false
  } catch(err) {
    return false
  }
}

async function ask(...args) {
    const answers = []
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    async function askQuestion(questionParam) {
        return new Promise(function (resolve) {
            rl.question(`${questionParam}`, function (answer) {
                answers.push(answer);
                resolve();
            });
        });
    }

    for (const idx in args) {
        await askQuestion(args[idx])
    }

    rl.close()
    return answers
}

module.exports = { replacePlaceholders, mergeObj, isCAPOperatorChart, ask }
