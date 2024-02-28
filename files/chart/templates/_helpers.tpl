{{- define "capApplicationVersionName" -}}
{{ printf "cav-%s-%d" (include "appName" $) (default .Values.app.version .Release.Revision) }}
{{- end -}}

{{- define "appName" -}}
{{- $saasRegistry := index .Values.serviceInstances "saas-registry" -}}
{{ printf "%s" $saasRegistry.parameters.appName }}
{{- end -}}
