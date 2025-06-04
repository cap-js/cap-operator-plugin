{{- define "capApplicationVersionName" -}}
{{ printf "%s-%d" (include "appName" $) (.Release.Revision) }}
{{- end -}}

{{- define "appName" -}}
{{- range $sik, $siv := .Values.serviceInstances}}
    {{- if and (eq (get $siv "serviceOfferingName") "xsuaa") (eq (get $siv "servicePlanName") "broker") -}}
        {{ printf "%s" $siv.parameters.xsappname }}
        {{- break -}}
    {{- end -}}
{{- end -}}
{{- end -}}

{{- define "domainName" -}}
{{ printf "%s-primary" (include "appName" $)}}
{{- end -}}

{{- define "hasService" -}}
{{- $found := "false" -}}
{{- $offeringName := .offeringName -}}
{{- $planName := .planName -}}
{{- $si := .si -}}
{{- range $sik, $siv := $si}}
    {{- if and (eq (get $siv "serviceOfferingName") $offeringName) (eq (get $siv "servicePlanName") $planName) -}}
        {{- $found = "true" -}}
    {{- end -}}
{{- end -}}
{{- $found -}}
{{- end -}}

{{- define "domainHostMap" -}}
  {{- $domainList := list .Values.app.domains.primary }}
  {{- range $index, $domainRef := .Values.app.domains.additionalDomainRefs }}
    {{- $apiVersion := "sme.sap.com/v1alpha1" }}
    {{- $kind := $domainRef.kind }}
    {{- $namespace := "" }}
    {{- if eq $kind "Domain" }}
      {{- $namespace = $.Release.Namespace }}
    {{- end }}
    {{- $resource := (lookup $apiVersion $kind $namespace $domainRef.name) }}
    {{- if and $resource (kindIs "map" $resource) (hasKey $resource "spec") (hasKey $resource.spec "domain") }}
      {{- $domainList = append $domainList $resource.spec.domain }}
    {{- end }}
  {{- end }}
  {{- $domainMap := dict "domains" $domainList }}
  {{- toJson $domainMap }}
{{- end }}

{{- define "redirectUris" -}}
  {{- $redirectUrisList := list }}
  {{- $domainMapJson := include "domainHostMap" . | fromJson }}
  {{- range $i, $domain := $domainMapJson.domains }}
  {{- $redirectUrisList = append $redirectUrisList (printf "https://*%s/**" $domain) -}}
  {{- end }}
  {{- $redirectUrisMap := dict "redirect-uris" $redirectUrisList }}
  {{- toJson $redirectUrisMap }}
{{- end }}

{{- define "tenantHostPattern" -}}
  {{- $domainMapJson := include "domainHostMap" . | fromJson }}
  {{- $doms := list -}}
  {{- range $i, $domain := $domainMapJson.domains }}
      {{- $doms = append $doms $domain -}}
  {{- end -}}
  {{- if gt (len $doms) 1 -}}
      {{- join "|" $doms | printf "^(.*).(%s)" -}}
  {{- else -}}
      {{- first $doms -}}
  {{- end -}}
{{- end }}

