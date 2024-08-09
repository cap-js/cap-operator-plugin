{{- define "capApplicationVersionName" -}}
{{ printf "cav-%s-%d" (include "appName" $) (default .Values.app.version .Release.Revision) }}
{{- end -}}

{{- define "appName" -}}
{{- $xsuaa := index .Values.serviceInstances "xsuaa" -}}
{{ printf "%s" $xsuaa.parameters.xsappname }}
{{- end -}}

{{- define "hasServicePlanName" -}}
{{- $servicePlanName := . -}}
{{- $found := false -}}
{{- range $key, $instance := .Values.serviceInstances -}}
  {{- if eq $instance.servicePlanName $servicePlanName -}}
    {{- $found = true -}}
  {{- end -}}
{{- end -}}
{{- $found -}}
{{- end -}}
