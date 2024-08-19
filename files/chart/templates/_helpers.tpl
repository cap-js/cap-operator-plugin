{{- define "capApplicationVersionName" -}}
{{ printf "cav-%s-%d" (include "appName" $) (.Release.Revision) }}
{{- end -}}

{{- define "appName" -}}
{{- $xsuaa := index .Values.serviceInstances "xsuaa" -}}
{{ printf "%s" $xsuaa.parameters.xsappname }}
{{- end -}}
