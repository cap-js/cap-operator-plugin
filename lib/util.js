/*
SPDX-FileCopyrightText: 2024 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
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

function _isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item)
}

function mergeObj(source, target) {
  const unique = array => [...new Set(array.map(JSON.stringify))].map(JSON.parse)
  if (_isObject(target) && _isObject(source)) {
    for (const key in source) {
      if (_isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: source[key] })
        else mergeObj(source[key], target[key])
      } else if (Array.isArray(source[key]) && Array.isArray(target[key])) {
        target[key] = unique([...source[key], ...target[key]])
      } else {
        Object.assign(target, { [key]: target[key] || source[key] })
      }
    }
  } else if (Array.isArray(target) && Array.isArray(source)) {
    target = unique([...source, ...target])
  }
  return target ?? source
}

function isCAPOperatorChart(chartFolderPath) {
  try {
    const chartYaml = cds.parse.yaml(cds.utils.fs.readFileSync(chartFolderPath + "/Chart.yaml").toString())
    return chartYaml.annotations?.["app.kubernetes.io/managed-by"] === 'cap-operator-plugin' || false
  } catch (err) {
    return false
  }
}

function isDynamicTemplateChart(chartFolderPath) {
  try {
    const chartYaml = cds.parse.yaml(cds.utils.fs.readFileSync(chartFolderPath + "/Chart.yaml").toString())
    return chartYaml.annotations?.["app.kubernetes.io/part-of"] === 'cap-operator-dynamic-templates' || false
  } catch (err) {
    return false
  }
}
async function ask(...args) {
  const answers = []
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  function askQuestion(question, suggestion, mandatory) {
    return new Promise((resolve) => {
      const prompt = suggestion ? `${question} [${suggestion}] ` : `${question} `
      console.log()
      rl.question(prompt, (answer) => {
        const trimmedAnswer = answer.trim()
        if (mandatory && !trimmedAnswer && !suggestion) {
          // If the question is mandatory and no answer is provided, re-ask the question
          console.error('\nThis question is mandatory. Please provide an answer.')
          resolve(askQuestion(question, suggestion, mandatory))
        } else {
          answers.push(trimmedAnswer || suggestion || '')
          resolve()
        }
      })
    })
  }

  for (const [question, suggestion, mandatory] of args) {
    await askQuestion(question, suggestion, mandatory)
  }

  rl.close()
  return answers
}


module.exports = { replacePlaceholders, mergeObj, isCAPOperatorChart, isDynamicTemplateChart, ask }
