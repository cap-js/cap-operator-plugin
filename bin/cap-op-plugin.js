#!/usr/bin/env node
/* eslint-disable no-console */

const isCli = require.main === module
const SUPPORTED = {'generate-runtime-values': ['--via-prompt', '--via-input-yaml']}

async function capOperatorPlugin(cmd, option, inputYamlPath) {

    try {
        if (!cmd) return _usage()
        if (!Object.keys(SUPPORTED).includes(cmd)) return _usage(`Unknown command ${cmd}.`)
        if (!SUPPORTED[cmd].includes(option)) return _usage(`Unknown option ${option}.`)
    } catch(e) {
        if (isCli) {
            console.error(e.message)
            process.exit(1)
        } else throw e
    }
}

async function _handleError(message) {
    if (isCli) {
        console.error(message)
        process.exit(1)
    }
    throw new Error(message)
}

async function _usage(message = '') {
    return _handleError(message + `

USAGE

   cap-op-plugin <command> [--via-prompt, --via-input-yaml <input-yaml-path>]

COMMANDS

    generate-runtime-values   generate runtime-values.yaml file for the cap-operator chart

EXAMPLES

   cap-op-plugin generate-runtime-values --via-prompt
   cap-op-plugin generate-runtime-values --via-input-file /path/to/input.yaml
`
    )
}

if (isCli) {
    const [, , cmd, option, inputYamlPath ] = process.argv
    ;(async () => await capOperatorPlugin(cmd, option, inputYamlPath ?? undefined))()
}

module.exports = { capOperatorPlugin }
