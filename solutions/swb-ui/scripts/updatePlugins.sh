#!/bin/bash
echo "Starting Update of Plugins";
cd ./solutions/swb-plugins;
for plugin in *; do #Iterate through swb-plugins
    if [[ "$(ls -l .)" == "total 0" ]]; then #Check to see if swb-plugins directory is empty
        echo "No Plugins Detected";
        break;
    fi
    if [ -d "$plugin" ]; then #Check to see if item is a directory
        pluginPackageName=$(jq -r '.name' ./$plugin/package.json);
        pluginUpper=$(echo "${plugin}" | tr “[a-z]” “[A-Z]”);
        if ! $(jq --arg pluginName $pluginPackageName 'any(.projects[].packageName == $pluginName; .)' ../../rush.json); then
            echo "Adding $pluginPackageName to rush.json";
            jq --arg pluginName $pluginPackageName --arg pluginFolder "solutions/swb-plugins/$plugin" '.projects += [{"packageName": $pluginName, "projectFolder": $pluginFolder, "reviewCategory": "production", "shouldPublish": true}]' ../../rush.json > ../../output_rush.json;
            mv ../../output_rush.json  ../../rush.json;
            echo "Added $pluginPackageName to rush.json";
            echo "Adding $pluginPackageName to package.json of swb-ui";
            jq --arg pluginName $pluginPackageName '.dependencies += {($pluginName): "workspace:*"}' ../swb-ui/package.json > ../swb-ui/output_package.json;
            mv ../swb-ui/output_package.json ../swb-ui/package.json;
            echo "Added $pluginPackageName to package.json of swb-ui";
            echo "Creating new page for $pluginPackageName in swb-ui/src/pages/apps using name $plugin";
            cp ../swb-ui/scripts/templates/app_page_template.txt ../swb-ui/src/pages/apps/$plugin.tsx;
            sed -i '' "s|<--Insert--Plugin--Package--Name-->|$pluginPackageName|g" ../swb-ui/src/pages/apps/$plugin.tsx;
            sed -i '' "s|<--Insert--Plugin--Name-->|$pluginUpper|g" ../swb-ui/src/pages/apps/$plugin.tsx;
            sed -i '' "s|<--Insert--Formal--Plugin--Name-->|$plugin|g" ../swb-ui/src/pages/apps/$plugin.tsx;
            echo "Created new page for $pluginPackageName in swb-ui/src/pages/apps using name $plugin";
        else
            echo "$pluginPackageName already added to rush.json";
        fi
    fi
done
for page in ../swb-ui/src/pages/apps/*; do #Iterate through all items in pages/apps
    if [[ $page == *.tsx ]]; then #Check to see if item is a .tsx file
        pluginExists="false";        
        for plugin in *; do #Iterate through swb-plugins
            if [[ "$(ls -l .)" == "total 0" ]]; then #Check to see if swb-plugins directory is empty
                pluginExists="false";
                break;
            fi
            if [ -d "$plugin" ]; then #Check to see if item is a directory
                if [[ $plugin == $(basename $page .tsx) ]]; then #Check to see if plugin has same name as .tsx file
                    pluginExists="true";
                fi
            fi
        done
        echo "Plugin for $(basename $page) Exists: $pluginExists";
        if [[ $pluginExists == "false" ]]; then #Proceed to clean up files associated with plugin
            pluginPackageName=$(head -n 1 $page | grep -o "'.*'" | tr -d "'");
            jq --arg pluginName $pluginPackageName 'del(.projects[] | select(.packageName == $pluginName))' ../../rush.json > ../../output_rush.json;
            mv ../../output_rush.json  ../../rush.json;
            jq 'del(.dependencies."'"$pluginPackageName"'")' ../swb-ui/package.json > ../swb-ui/output_package.json;
            mv ../swb-ui/output_package.json ../swb-ui/package.json;
            rm $page; #Delete page associated with plugin
        fi
    fi
done 
echo "Running rush update";
rush update;
echo "Fininshed Updating of Plugins";
echo "You may now run 'rush build' to build Service Workbench.";