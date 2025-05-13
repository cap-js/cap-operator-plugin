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

{{- define "domainPatterns" -}}
    {{- if .Values.app.domains.secondary -}}
        {{- $doms := list .Values.app.domains.primary -}}
        {{- range $index, $secondary := .Values.domains.secondary }}
            {{- $doms = append $doms $secondary.domainHost -}}
        {{- end -}}
        {{- if gt (len $doms) 1 -}}
            {{- join "|" $doms | printf "(%s)" -}}
        {{- else -}}
            {{- first $doms -}}
        {{- end -}}
    {{- else -}}
        {{- printf "%s" .Values.app.domains.primary -}}
    {{- end -}}
{{- end -}}

{{- define "originalAppName" -}}
{{ print "bookshop" }}
{{- end -}}
