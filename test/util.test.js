const { expect } = require("chai")
const sinon = require('sinon')
const { ask, setPromptFunction, mergeObj } = require("../lib/util")

describe("ask function", () => {
    let promptStub

    beforeEach(() => {
        promptStub = sinon.stub()
        setPromptFunction(promptStub)
    })

    afterEach(() => {
        setPromptFunction(null)
        sinon.restore()
    })

    it('should prompt the user with the given questions and suggestions', async () => {
        const questions = [
            ['What is your name?', 'John Doe', true],
            ['What is your age?', '30', true]
        ]

        promptStub.resolves({ '0': 'Alice', '1': '25' })

        const answers = await ask(...questions)

        expect(answers).to.deep.equal(['Alice', '25'])
    })

    it('should use the suggestion if no input is provided and it is not mandatory', async () => {
        const questions = [
            ['What is your name?', 'John Doe', false],
            ['What is your age?', '30', false]
        ]

        promptStub.resolves({ '0': '', '1': '' })

        const answers = await ask(...questions)

        expect(answers).to.deep.equal(['John Doe', '30'])
    })

    it('should pass required flag for mandatory questions without defaults', async () => {
        const questions = [
            ['What is your name?', '', true],
            ['What is your age?', '30', true]
        ]

        promptStub.resolves({ '0': 'Alice', '1': '25' })

        await ask(...questions)

        const promptArgs = promptStub.firstCall.args[0]
        expect(promptArgs[0].required).to.equal(true)
        expect(promptArgs[1].required).to.equal(false) // has default, so not required
    })
})

describe("mergeObj function", () => {
    it("should merge two objects recursively", () => {
        const source = {
            prop1: "value1",
            prop2: {
                nestedProp1: "nestedValue1",
                nestedProp2: "nestedValue2"
            },
            prop3: ["item1", "item2"]
        }
        const target = {
            prop1: "value2",
            prop2: {
                nestedProp1: "nestedValue3",
                nestedProp3: "nestedValue4"
            },
            prop3: ["item3", "item4"]
        }
        const expected = {
            prop1: "value2",
            prop2: {
                nestedProp1: "nestedValue3",
                nestedProp2: "nestedValue2",
                nestedProp3: "nestedValue4"
            },
            prop3: ["item1", "item2", "item3", "item4"]
        }
        const result = mergeObj(source, target)
        expect(result).to.deep.equal(expected)
    })

    it("should handle empty objects and arrays", () => {
        const source = {}
        const target = []
        const expected = []
        const result = mergeObj(source, target)
        expect(result).to.deep.equal(expected)
    })

    it("should handle null and undefined values", () => {
        const source = {
            prop1: null,
            prop2: undefined
        }
        const target = {
            prop1: "value1",
            prop2: "value2"
        }
        const expected = {
            prop1: "value1",
            prop2: "value2"
        }
        const result = mergeObj(source, target)
        expect(result).to.deep.equal(expected)
    })
})
