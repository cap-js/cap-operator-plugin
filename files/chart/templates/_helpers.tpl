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
