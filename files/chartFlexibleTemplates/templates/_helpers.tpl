{{- define "capApplicationVersionName" -}}
{{ printf "cav-%s-%d" (include "appName" $) (default .Values.app.version .Release.Revision) }}
{{- end -}}

{{- define "appName" -}}
{{- $xsuaa := index .Values.serviceInstances "xsuaa" -}}
{{ printf "%s" $xsuaa.parameters.xsappname }}
{{- end -}}

{{- define "hasServiceOfferingName" -}}
{{- $found := "false" -}}
{{- $offeringName := .offeringName -}}
{{- $si := .si -}}
{{- range $sik, $siv := $si}}
{{- if (eq (get $siv "serviceOfferingName") $offeringName) -}}
{{- $found = "true" -}}
{{- end -}}
{{- end -}}
{{- $found -}}
{{- end -}}
