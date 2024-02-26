{{- define "capApplicationVersionName" -}}
{{- $saasRegistry := index .Values.serviceInstances "saas-registry" -}}
{{ printf "cav-%s-%d" $saasRegistry.parameters.appName (default .Values.app.version .Release.Revision) }}
{{- end -}}

{{- define "appName" -}}
{{- $saasRegistry := index .Values.serviceInstances "saas-registry" -}}
{{ printf "%s" $saasRegistry.parameters.appName }}
{{- end -}}