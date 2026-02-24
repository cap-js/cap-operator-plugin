/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

const cds = require('@sap/cds-dk')
const { join } = cds.utils.path
const md5 = data => require('crypto').createHash('md5').update(data).digest('hex')

const { replacePlaceholders, mergeObj, convertHypenNameToCamelcase } = require('./util')

module.exports = class MtaTransformer {

    serviceBindingNameSuffix = "-bind"

    constructor(mtaFilePath, mtaExtensionPaths) {
        this.mtaFilePath = mtaFilePath
        this.serviceBindings = new Map()
        this.serviceInstances = new Map()
        this.workloads = new Map()
        this.mtaExtensionPaths = mtaExtensionPaths
    }

    async readMtaExtensions() {
        let mtaExtensions = []
        for(let file of this.mtaExtensionPaths) {
          let mtaExt = cds.parse.yaml(await cds.utils.read(cds.utils.path.join(cds.root, file)))
          if (mtaExt && mtaExt["_schema-version"].split(".")[0] === this.mta["_schema-version"].split(".")[0] && mtaExt["extends"] === this.mta["ID"]) {
            mtaExtensions.push(mtaExt)
          } else {
            console.log(`⚠️  ${file} is not a valid mta extension file. _schema major version or extends doesn't match. Skipping...`)
          }
        }
        return mtaExtensions
      }

    async getMta() {
        this.mta = cds.parse.yaml(await cds.utils.read(join(cds.root, this.mtaFilePath)))

        this.mtaExtensions = await this.readMtaExtensions()

        this.mergedMta = this.merge(this.mta, this.mtaExtensions)

        if (this.mergedMta.parameters){
            this.mergedMta.modules = replacePlaceholders(this.mergedMta.modules, this.mergedMta.parameters)
            this.mergedMta.resources = replacePlaceholders(this.mergedMta.resources, this.mergedMta.parameters)
        }
    }

    mergeModules(mtaModules, mtaExtensionModules) {
        let mergedMtaModules = mtaModules
        for (let mtaExtensionModule of mtaExtensionModules) {
            let moduleIndex = mergedMtaModules.findIndex(m => m.name === mtaExtensionModule.name)

            if (moduleIndex === -1)
                mergedMtaModules.push(mtaExtensionModule)
            else {
                mergedMtaModules[moduleIndex].properties = mergeObj(mergedMtaModules[moduleIndex].properties, mtaExtensionModule.properties)
            }
        }
        return mergedMtaModules
    }

    mergeResources(mtaResources, mtaExtensionResources) {
        let mergedMtaResources = mtaResources
        for (let mtaExtensionResource of mtaExtensionResources) {
            let resourceIndex = mergedMtaResources.findIndex(r => r.name === mtaExtensionResource.name)

            if (resourceIndex === -1)
                mergedMtaResources.push(mtaExtensionResource)
            else {
                mergedMtaResources[resourceIndex].parameters = mergeObj(mergedMtaResources[resourceIndex].parameters, mtaExtensionResource.parameters)
            }
        }
        return mergedMtaResources
    }

    merge(mta, mtaExtensions) {
        let mergedMta = mta

        for(let mtaExtension of mtaExtensions) {
            // Merge parameters
            mergedMta.parameters = mergeObj(mergedMta.parameters, mtaExtension.parameters)

            // Merge modules
            if (mtaExtension.modules)
                mergedMta.modules = this.mergeModules(mergedMta.modules, mtaExtension.modules)

            // Merge resources
            if (mtaExtension.resources)
                mergedMta.resources = this.mergeResources(mergedMta.resources, mtaExtension.resources)
        }
        return mergedMta
    }

    async getServiceInstances() {
        if(this.serviceInstances.size !== 0) return this.serviceInstances

        if(!this.mergedMta) await this.getMta()

        let managedSvcs = this.mergedMta?.resources.filter(r => r.type === 'org.cloudfoundry.managed-service') || []
        for(let svc of managedSvcs) {
            // Validate required parameters exist
            if (!svc.parameters) {
                console.warn(`⚠️  Service ${svc.name} is missing parameters. Skipping.`)
                continue
            }

            const serviceOffering = svc.parameters["service"]
            const servicePlan = svc.parameters["service-plan"]

            if (!serviceOffering || !servicePlan) {
                console.warn(`⚠️  Service ${svc.name} is missing 'service' or 'service-plan' parameters. Skipping.`)
                continue
            }

            const serviceInstanceKey = convertHypenNameToCamelcase(serviceOffering + "-" + servicePlan)

            this.serviceInstances.set(
                serviceInstanceKey,
                {
                    name: svc.name,
                    serviceOfferingName: serviceOffering,
                    servicePlanName: servicePlan,
                    parameters: svc.parameters["config"] || {}
                }
            )
        }

        // for xsuaa service instance, remove oauth2-configuration -> redirect-uris as it is filled by service-instance.yaml template
        for (let [key, value] of this.serviceInstances.entries()) {
            if (value.serviceOfferingName === "xsuaa") {
                let serviceInstance = this.serviceInstances.get(key)
                if (serviceInstance.parameters && serviceInstance.parameters["oauth2-configuration"] && serviceInstance.parameters["oauth2-configuration"]["redirect-uris"]) {
                    delete serviceInstance.parameters["oauth2-configuration"]["redirect-uris"]
                    // if oauth2-configuration doesn't have any other properties, delete it as well
                    if (Object.keys(serviceInstance.parameters["oauth2-configuration"]).length === 0) {
                        delete serviceInstance.parameters["oauth2-configuration"]
                    }
                    this.serviceInstances.set(key, serviceInstance)
                }
            }
        }

        return this.serviceInstances
    }

    isManagedServiceInstance(consumedBTPServiceName) {
        // check managed services
        for (let [, value] of this.serviceInstances.entries()) {
            if (value.name === consumedBTPServiceName)
                return true
        }
        return false
    }

    isExistingServiceInstance(consumedBTPServiceName) {
        // check existing services
        let existingSvcs = this.mergedMta?.resources.filter(r => r.type === 'org.cloudfoundry.existing-service') || []
        for (let existingSvc of existingSvcs) {
            if (existingSvc.name === consumedBTPServiceName)
                return true
        }
        return false
    }

    async getServiceBindings() {
        if (this.serviceBindings.size !== 0) return this.serviceBindings

        if (this.workloads.size === 0 ) await this.getWorkloads()

        return this.serviceBindings
    }

    getConsumedBTPServices(module) {
        let consumedBTPServices = module?.requires?.filter(r => r["group"] === undefined) || []
        let workloadServiceBindings = []
        for (let consumedBTPService of consumedBTPServices) {

            if (this.isExistingServiceInstance(consumedBTPService.name)) {
                workloadServiceBindings.push(consumedBTPService.name)
                continue
            }

            if (!this.isManagedServiceInstance(consumedBTPService.name)) {
                console.log(`⚠️  No service instance found with name ${consumedBTPService.name}. Skipping serviceBinding creation.`)
                continue
            }

            let serviceBindingName = consumedBTPService.name + this.serviceBindingNameSuffix
            let serviceBindingNameKey = convertHypenNameToCamelcase(serviceBindingName)
            let serviceBindingValue = {
                name: serviceBindingName,
                parameters: consumedBTPService.properties ?? {},
                secretKey: "credentials",
                secretName: serviceBindingName + "-secret",
                serviceInstanceName: consumedBTPService.name,
            }
            if (this.serviceBindings.has(serviceBindingNameKey) &&
                    md5(JSON.stringify(this.serviceBindings.get(serviceBindingNameKey))) !== md5(JSON.stringify(serviceBindingValue))) {

                let serviceBindingNewName = consumedBTPService.name +"-"+ module.name + this.serviceBindingNameSuffix
                let serviceBindingNewNameKey = convertHypenNameToCamelcase(serviceBindingNewName)
                this.serviceBindings.set(serviceBindingNewNameKey, {
                    name: serviceBindingNewName,
                    parameters: consumedBTPService.properties ?? {},
                    secretKey: "credentials",
                    secretName: serviceBindingNewName + "-secret",
                    serviceInstanceName: consumedBTPService.name,
                })
                workloadServiceBindings.push(serviceBindingNewName)
            } else if (this.serviceBindings.has(serviceBindingNameKey) &&
                    md5(JSON.stringify(this.serviceBindings.get(serviceBindingNameKey))) === md5(JSON.stringify(serviceBindingValue))) {

                workloadServiceBindings.push(serviceBindingName)
                continue
            }
            else {
                workloadServiceBindings.push(serviceBindingName)
                this.serviceBindings.set(serviceBindingNameKey,serviceBindingValue)
            }
        }
        return workloadServiceBindings
    }

    getWorkloadEnv(properties) {
        let env = []
        for (const [key, value] of Object.entries(properties)) {
            env.push({
                name: key,
                value: typeof value === 'string'? value : JSON.stringify(value)
            })
        }
        return env
    }

    async getWorkloads() {
        if (this.workloads.size !== 0) return this.workloads

        if (this.serviceInstances.size === 0) await this.getServiceInstances()

        let modules = this.mergedMta?.modules.filter(m => m.type.includes('nodejs') || m.type === 'com.sap.application.content') || []
        for (let module of modules) {
            let workload = {
                name: module.name,
                consumedBTPServices: this.getConsumedBTPServices(module)
            }
            if (module.path?.includes("gen/mtx/sidecar") || module.type === 'com.sap.application.content') {
                workload.jobDefinition = {
                    type:  module.type === 'com.sap.application.content'? "Content": "TenantOperation",
                    image: null
                }
            } else if (module.path?.includes("gen/srv")) {
                workload.deploymentDefinition = {
                    type: "CAP",
                    image: null
                }
            } else {
                workload.deploymentDefinition = {
                    type: module.path?.includes("approuter") || module.path?.includes("router") ? "Router" : "Additional",
                    image: null
                }
            }

            if (module.properties) {
                let workloadEnv = this.getWorkloadEnv(module.properties)
                if (workloadEnv.length > 0)
                    workload[workload.deploymentDefinition ? 'deploymentDefinition' : 'jobDefinition'].env = workloadEnv
            }

            // delete existing TENANT_HOST_PATTERN if any; Handled in cap-operator-cro.yaml template
            if (workload.deploymentDefinition?.type == "Router") {
                if (workload.deploymentDefinition.env) {
                   const index = workload.deploymentDefinition.env.findIndex(e => e.name === "TENANT_HOST_PATTERN")
                   if (index != -1)
                     workload.deploymentDefinition.env.splice(index, 1)
                }
            }

            this.workloads.set(convertHypenNameToCamelcase(module.name), workload)
        }
        return this.workloads
    }
}
