/*
SPDX-FileCopyrightText: 2025 SAP SE or an SAP affiliate company and cap-operator-plugin contributors
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
	"encoding/json"
	"fmt"
	"os"

	servicesv1 "github.com/SAP/sap-btp-service-operator/api/v1"
	"github.com/invopop/jsonschema"
	"github.com/sap/cap-operator/pkg/apis/sme.sap.com/v1alpha1"
)

type DomainRef struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type Domains struct {
	Primary              string      `json:"primary"`
	AdditionalDomainRefs []DomainRef `json:"additionalDomainRefs"`
}

type provider struct {
	// BTP subaccount subdomain
	Subdomain string `json:"subdomain"`
	// BTP subaccount Tenant ID
	TenantId string `json:"tenantId"`
}

type app struct {
	Domains                   Domains           `json:"domains"`
	IstioIngressGatewayLabels map[string]string `json:"istioIngressGatewayLabels"`
}

type serviceInstanceExt struct {
	Name string `json:"name"`
	*servicesv1.ServiceInstanceSpec
	JsonParameters string `json:"jsonParameters,omitempty"`
}

type serviceBindingExt struct {
	Name string `json:"name"`
	*servicesv1.ServiceBindingSpec
}

type btp struct {
	GlobalAccountId string   `json:"globalAccountId"`
	Provider        provider `json:"provider"`
}

type chartValue struct {
	App              app                                 `json:"app"`
	Btp              btp                                 `json:"btp"`
	ImagePullSecrets []string                            `json:"imagePullSecrets,omitempty"`
	ServiceInstances map[string]serviceInstanceExt       `json:"serviceInstances"`
	ServiceBindings  map[string]serviceBindingExt        `json:"serviceBindings"`
	Workloads        map[string]v1alpha1.WorkloadDetails `json:"workloads"`
	TenantOperations v1alpha1.TenantOperations           `json:"tenantOperations,omitempty"`
	ContentJobs      []string                            `json:"contentJobs,omitempty"`
	ServiceExposures []v1alpha1.ServiceExposure          `json:"serviceExposures,omitempty"`
}

type workloadDefinition struct {
	Image string `json:"image"`
}

type configurableChartValue struct {
	App              app                           `json:"app"`
	Btp              btp                           `json:"btp"`
	ImagePullSecrets []string                      `json:"imagePullSecrets,omitempty"`
	HanaInstanceId   string                        `json:"hanaInstanceId,omitempty"`
	ServiceInstances map[string]serviceInstanceExt `json:"serviceInstances"`
	ServiceBindings  map[string]serviceBindingExt  `json:"serviceBindings"`
	Workloads        map[string]workloadDefinition `json:"workloads"`
}

func updateProperties(data []byte) []byte {

	m := map[string]interface{}{}

	json.Unmarshal(data, &m)

	rawExt := m["$defs"].(map[string]interface{})["RawExtension"].(map[string]interface{})
	rawExt["additionalProperties"] = true
	m["$defs"].(map[string]interface{})["RawExtension"] = rawExt

	quantity := m["$defs"].(map[string]interface{})["Quantity"].(map[string]interface{})
	quantity["type"] = "string"
	delete(quantity, "properties")
	delete(quantity, "required")
	m["$defs"].(map[string]interface{})["Quantity"] = quantity

	serviceBindingSpec := m["$defs"].(map[string]interface{})["serviceBindingExt"].(map[string]interface{})
	serviceBindingSpec["required"] = []string{"name", "serviceInstanceName", "secretName"}

	chartValue := m["$defs"].(map[string]interface{})["chartValue"].(map[string]interface{})
	chartValue["additionalProperties"] = true
	m["$defs"].(map[string]interface{})["chartValue"] = chartValue

	data, _ = json.Marshal(m)

	return data
}

func updatePropertiesconfigurableChart(data []byte) []byte {

	m := map[string]interface{}{}

	json.Unmarshal(data, &m)

	rawExt := m["$defs"].(map[string]interface{})["RawExtension"].(map[string]interface{})
	rawExt["additionalProperties"] = true
	m["$defs"].(map[string]interface{})["RawExtension"] = rawExt

	serviceBindingSpec := m["$defs"].(map[string]interface{})["serviceBindingExt"].(map[string]interface{})
	serviceBindingSpec["required"] = []string{"name", "serviceInstanceName", "secretName"}

	workloadDefinition := m["$defs"].(map[string]interface{})["workloadDefinition"].(map[string]interface{})
	workloadDefinition["additionalProperties"] = true
	m["$defs"].(map[string]interface{})["workloadDefinition"] = workloadDefinition

	configurableChartValue := m["$defs"].(map[string]interface{})["configurableChartValue"].(map[string]interface{})
	configurableChartValue["additionalProperties"] = true
	m["$defs"].(map[string]interface{})["configurableChartValue"] = configurableChartValue

	data, _ = json.Marshal(m)

	return data
}

func main() {

	s := jsonschema.Reflect(&chartValue{})
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		panic(err.Error())
	}

	data = updateProperties(data)
	fmt.Println(string(data))

	// write the whole body at once
	err = os.WriteFile("../files/chart/values.schema.json", data, 0644)
	if err != nil {
		panic(err)
	}

	// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

	sV2 := jsonschema.Reflect(&configurableChartValue{})
	dataV2, errV2 := json.MarshalIndent(sV2, "", "  ")
	if errV2 != nil {
		panic(errV2.Error())
	}

	dataV2 = updatePropertiesconfigurableChart(dataV2)
	fmt.Println(string(dataV2))

	// write the whole body at once
	err = os.WriteFile("../files/configurableTemplatesChart/values.schema.json", dataV2, 0644)
	if err != nil {
		panic(err)
	}
}
