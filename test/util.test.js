const { expect } = require("chai")
const { ask, mergeObj } = require("../lib/util")
const readline = require('readline')

const sinon = require('sinon')

describe("ask function", () => {
    let rlInterface
    let rlQuestion

    beforeEach(() => {
        rlQuestion = sinon.stub()
        rlInterface = {
            question: rlQuestion,
            close: sinon.stub()
        }
        sinon.stub(readline, 'createInterface').returns(rlInterface)
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should prompt the user with the given questions and suggestions', async () => {
        const questions = [
            ['What is your name?', 'John Doe', true],
            ['What is your age?', '30', true]
        ]

        rlQuestion.onFirstCall().callsArgWith(1, 'Alice')
        rlQuestion.onSecondCall().callsArgWith(1, '25')

        const answers = await ask(...questions)

        expect(answers).to.deep.equal(['Alice', '25'])
    })

    it('should use the suggestion if no input is provided and it is not mandatory', async () => {
        const questions = [
            ['What is your name?', 'John Doe', false],
            ['What is your age?', '30', false]
        ]

        rlQuestion.onFirstCall().callsArgWith(1, '')
        rlQuestion.onSecondCall().callsArgWith(1, '')

        const answers = await ask(...questions)

        expect(answers).to.deep.equal(['John Doe', '30'])
    })

    it('should re-ask mandatory questions if no input is provided', async () => {
        const questions = [
            ['What is your name?', '', true],
            ['What is your age?', '', true]
        ]

        rlQuestion.onFirstCall().callsArgWith(1, '')
        rlQuestion.onSecondCall().callsArgWith(1, 'Alice')
        rlQuestion.onThirdCall().callsArgWith(1, '25')

        const answers = await ask(...questions)

        expect(answers).to.deep.equal(['Alice', '25'])
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
