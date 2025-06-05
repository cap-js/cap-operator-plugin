{{- define "capApplicationVersionName" -}}
{{ printf "%s-%d" (include "appName" $) (.Release.Revision) }}
{{- end -}}

{{- define "domainName" -}}
{{ printf "%s-primary" (include "appName" $)}}
{{- end -}}

{{- define "appName" -}}
{{- range $sik, $siv := .Values.serviceInstances }}
    {{- if and (eq (get $siv "serviceOfferingName") "xsuaa") (eq (get $siv "servicePlanName") "broker") -}}
        {{ printf "%s" $siv.parameters.xsappname }}
        {{- break -}}
    {{- end -}}
{{- end -}}
{{- end -}}

{{- define "domainHostMap" -}}
  {{- $domains := list .Values.app.domains.primary -}}
  {{- range .Values.app.domains.additionalDomainRefs }}
    {{- $apiVersion := "sme.sap.com/v1alpha1" -}}
    {{- $namespace := (eq .kind "Domain" | ternary $.Release.Namespace "") -}}
    {{- $resource := (lookup $apiVersion .kind $namespace .name) -}}
    {{- if and $resource (kindIs "map" $resource) (hasKey $resource "spec") (hasKey $resource.spec "domain") -}}
      {{- $domains = append $domains $resource.spec.domain -}}
    {{- end -}}
  {{- end -}}
  {{- toJson (dict "domains" $domains) -}}
{{- end }}

{{- define "redirectUris" -}}
  {{- $domains := (include "domainHostMap" . | fromJson).domains -}}
  {{- $redirectUris := list -}}
  {{- range $domains }}
    {{- $redirectUris = append $redirectUris (printf "https://*.%s/**" .) -}}
  {{- end -}}
  {{- toJson (dict "redirect-uris" $redirectUris) -}}
{{- end }}

{{- define "tenantHostPattern" -}}
  {{- $domains := (include "domainHostMap" . | fromJson).domains -}}
  {{- printf "^(.*)\\.(%s)" (join "|" $domains | replace "." "\\.") -}}
{{- end }}
